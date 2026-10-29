import json
from pathlib import Path
from PIL import Image, ImageOps
images=json.loads(Path('.validation/catalog-images.json').read_text(encoding='utf-8'))
done=set()
for i,entry in enumerate(images):
    target=Path(entry['destination'])
    if str(target) in done: continue
    with Image.open(entry['source']) as image:
        image=ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((320,440))
        image.save(target,'WEBP',quality=74,method=4)
    done.add(str(target))
    if i%500==0: print(f'{i}/{len(images)}',flush=True)
print(f'{len(done)} thumbnails, {sum(Path(p).stat().st_size for p in done)/1024/1024:.1f} MiB')
