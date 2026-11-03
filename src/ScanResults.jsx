export function ScanResults({games,busy,onMark,onClose}){
  const pending=games.filter(game=>game.status!=='discard').length;
  return <div className="scan-results">
    <p><strong>{games.length.toLocaleString()} games cannot be launched</strong> and are hidden from the game lists.</p>
    <p>Mark {pending.toLocaleString()} for removal? Their files will stay until you finish the session and run cleanup.</p>
    <div className="modal-actions"><button disabled={busy} onClick={onClose}>No</button><button className="danger" disabled={busy||!pending} onClick={onMark}>Yes, mark for removal</button></div>
  </div>;
}
