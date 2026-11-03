use std::collections::HashMap;
use jgenesis_common::audio::DynamicResamplingRate;
use bincode::{Decode, Encode};
use wasm_bindgen::prelude::*;
use genesis_core::{GenesisEmulator, GenesisEmulatorConfig};
use genesis_config::{GenesisInputs, GenesisButton};
use snes_core::{api::{SnesEmulator, SnesEmulatorConfig, CoprocessorRoms}, input::SnesInputs};
use snes_config::SnesButton;
use jgenesis_common::{input::Player, frontend::{AudioOutput, Color, ConstantInputPoller, EmulatorTrait, FrameSize, MappableInputs, Renderer, RenderFrameOptions, SaveWriter, TickEffect}};

// Owns the same cores as the desktop-style web frontend, with no DOM or winit dependency.
#[derive(Default)]
struct Video { pixels: Vec<u8>, width: u32, height: u32, fps: f64, aspect: f64 }
impl Renderer for Video {
    type Err = String;
    fn render_frame(&mut self, buffer: &[Color], size: FrameSize, fps: f64, options: RenderFrameOptions) -> Result<(), String> {
        self.width=size.width; self.height=size.height; self.fps=fps;
        self.aspect=size.width as f64 * options.pixel_aspect_ratio.map(f64::from).unwrap_or(1.0) / size.height as f64;
        self.pixels.clear();
        for c in &buffer[..size.len() as usize] { self.pixels.extend_from_slice(&[c.r,c.g,c.b,c.a]); }
        Ok(())
    }
}
#[derive(Default)]
struct Audio { samples: Vec<f32> }
impl AudioOutput for Audio {
    type Err=String;
    fn push_sample(&mut self,l:f64,r:f64)->Result<(),String>{ self.samples.extend_from_slice(&[l as f32,r as f32]); Ok(()) }
}
#[derive(Default)]
struct Saves { files: HashMap<String,Vec<u8>>, dirty: HashMap<String,Vec<u8>> }
fn encoding()->impl bincode::config::Config { bincode::config::standard().with_little_endian().with_fixed_int_encoding().with_limit::<{10*1024*1024}>() }
impl SaveWriter for Saves {
    type Err=String;
    fn load_bytes(&mut self,ext:&str)->Result<Vec<u8>,String>{self.files.get(ext).cloned().ok_or_else(||"No save".into())}
    fn persist_bytes(&mut self,ext:&str,bytes:&[u8])->Result<(),String>{
        if self.files.get(ext).map(Vec::as_slice)!=Some(bytes) { self.files.insert(ext.into(),bytes.into());self.dirty.insert(ext.into(),bytes.into()); } Ok(())
    }
    fn load_serialized<D:Decode<()>>(&mut self,ext:&str)->Result<D,String>{ bincode::decode_from_slice(&self.load_bytes(ext)?,encoding()).map(|(v,_)|v).map_err(|e|e.to_string()) }
    fn persist_serialized<E:Encode>(&mut self,ext:&str,data:E)->Result<(),String>{let bytes=bincode::encode_to_vec(data,encoding()).map_err(|e|e.to_string())?;self.persist_bytes(ext,&bytes)}
}
enum Core { Genesis(Box<GenesisEmulator>,GenesisInputs), Snes(Box<SnesEmulator>,SnesInputs) }
#[wasm_bindgen]
pub struct WorkerCore { core: Core, video: Video, audio: Audio, saves: Saves, resampling: DynamicResamplingRate, sample_rate: u32 }
#[wasm_bindgen]
impl WorkerCore {
    #[wasm_bindgen(constructor)]
    pub fn new(system:&str,rom:Vec<u8>,sample_rate:u32,saves_json:&str)->Result<WorkerCore,JsValue>{
        console_error_panic_hook::set_once();
        let mut saves=Saves{files:serde_json::from_str(saves_json).map_err(|e|JsValue::from_str(&e.to_string()))?,..Default::default()};
        let core=match system {
            "megadrive"=>{let mut e=GenesisEmulator::create(rom,GenesisEmulatorConfig::default(),&mut saves); e.update_audio_output_frequency(sample_rate as u64); Core::Genesis(Box::new(e),GenesisInputs::default())},
            "snes"=>{let mut e=SnesEmulator::create(rom,SnesEmulatorConfig::default(),CoprocessorRoms::none(),&mut saves).map_err(|e|JsValue::from_str(&e.to_string()))?;e.update_audio_output_frequency(sample_rate as u64);Core::Snes(Box::new(e),SnesInputs::default())},
            _=>return Err(JsValue::from_str("Unsupported worker console"))
        };
        Ok(Self{core,video:Video::default(),audio:Audio::default(),saves,resampling:DynamicResamplingRate::new(sample_rate,sample_rate/20),sample_rate})
    }
    pub fn frame(&mut self)->Result<(),JsValue>{
        loop {
            let result=match &mut self.core {
                Core::Genesis(e,i)=>e.tick(&mut self.video,&mut self.audio,&mut ConstantInputPoller(i),&mut self.saves).map_err(|e|e.to_string()),
                Core::Snes(e,i)=>e.tick(&mut self.video,&mut self.audio,&mut ConstantInputPoller(i),&mut self.saves).map_err(|e|e.to_string()),
            }.map_err(|e|JsValue::from_str(&e))?;
            if result==TickEffect::FrameRendered {return Ok(())}
        }
    }
    pub fn save_state(&self)->Result<Vec<u8>,JsValue>{
        let (header,encoded)=match &self.core {
            Core::Genesis(e,_) => (b"GRS1GEN0",bincode::encode_to_vec((e,&self.saves.files),encoding())),
            Core::Snes(e,_) => (b"GRS1SNS0",bincode::encode_to_vec((e,&self.saves.files),encoding())),
        };
        let mut bytes=header.to_vec();bytes.extend(encoded.map_err(|e|JsValue::from_str(&e.to_string()))?);Ok(bytes)
    }
    pub fn load_state(&mut self,bytes:&[u8])->Result<(),JsValue>{
        // Decode fully before touching the running core. ROM bytes remain local, never in the state.
        if bytes.len()<8||bytes.len()>10*1024*1024{return Err(JsValue::from_str("Invalid state size"));}
        let files=match &mut self.core {
            Core::Genesis(current,inputs)=>{
                if &bytes[..8]!=b"GRS1GEN0"{return Err(JsValue::from_str("Wrong state format"));}
                let ((mut restored,files),used):((Box<GenesisEmulator>,HashMap<String,Vec<u8>>),usize)=bincode::decode_from_slice(&bytes[8..],encoding()).map_err(|e|JsValue::from_str(&e.to_string()))?;
                if used!=bytes.len()-8{return Err(JsValue::from_str("Trailing state data"));}
                restored.take_rom_from(current);restored.reload_config(&GenesisEmulatorConfig::default());restored.update_audio_output_frequency(self.sample_rate as u64);*current=restored;*inputs=GenesisInputs::default();files
            },
            Core::Snes(current,inputs)=>{
                if &bytes[..8]!=b"GRS1SNS0"{return Err(JsValue::from_str("Wrong state format"));}
                let ((mut restored,files),used):((Box<SnesEmulator>,HashMap<String,Vec<u8>>),usize)=bincode::decode_from_slice(&bytes[8..],encoding()).map_err(|e|JsValue::from_str(&e.to_string()))?;
                if used!=bytes.len()-8{return Err(JsValue::from_str("Trailing state data"));}
                restored.take_rom_from(current);restored.reload_config(&SnesEmulatorConfig::default());restored.update_audio_output_frequency(self.sample_rate as u64);*current=restored;*inputs=SnesInputs::default();files
            }
        };
        self.saves.files=files.clone();self.saves.dirty=files;self.audio.samples.clear();self.resampling=DynamicResamplingRate::new(self.sample_rate,self.sample_rate/20);
        match &mut self.core{Core::Genesis(e,_)=>e.force_render(&mut self.video),Core::Snes(e,_)=>e.force_render(&mut self.video)}.map_err(|e|JsValue::from_str(&e))
    }
    pub fn pixels(&self)->Vec<u8>{self.video.pixels.clone()}
    pub fn width(&self)->u32{self.video.width}
    pub fn height(&self)->u32{self.video.height}
    pub fn aspect(&self)->f64{self.video.aspect}
    pub fn fps(&self)->f64{match &self.core{Core::Genesis(e,_)=>e.target_fps(),Core::Snes(e,_)=>e.target_fps()}}
    pub fn adjust_audio(&mut self,buffered:u32){
        self.resampling.adjust(buffered);
        let rate=self.resampling.current_output_frequency() as u64;
        match &mut self.core{Core::Genesis(e,_)=>e.update_audio_output_frequency(rate),Core::Snes(e,_)=>e.update_audio_output_frequency(rate)}
    }
    pub fn take_audio(&mut self)->Vec<f32>{std::mem::take(&mut self.audio.samples)}
    pub fn take_saves(&mut self)->String{serde_json::to_string(&std::mem::take(&mut self.saves.dirty)).unwrap()}
    pub fn release_keys(&mut self){match &mut self.core{Core::Genesis(_,i)=>*i=GenesisInputs::default(),Core::Snes(_,i)=>*i=SnesInputs::default()}}
    pub fn key(&mut self,code:&str,down:bool,player:u8){
        let player=if player==2{Player::Two}else{Player::One};
        match &mut self.core {
            Core::Genesis(_,inputs)=>{use GenesisButton::*;let b=match code{"ArrowUp"=>Up,"ArrowDown"=>Down,"ArrowLeft"=>Left,"ArrowRight"=>Right,"KeyA"=>A,"KeyS"=>B,"KeyD"=>C,"KeyQ"=>X,"KeyW"=>Y,"KeyE"=>Z,"Enter"=>Start,"ShiftRight"=>Mode,_=>return}; inputs.set_field(b,player,down)},
            Core::Snes(_,inputs)=>{use SnesButton::*;let b=match code{"ArrowUp"=>Up,"ArrowDown"=>Down,"ArrowLeft"=>Left,"ArrowRight"=>Right,"KeyS"=>A,"KeyX"=>B,"KeyA"=>X,"KeyZ"=>Y,"KeyD"=>L,"KeyC"=>R,"Enter"=>Start,"ShiftRight"=>Select,_=>return};inputs.set_field(b,player,down)}
        }
    }
}
