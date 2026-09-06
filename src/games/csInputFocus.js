// Pointer-lock release can follow a secondary click or its native context menu.
// Keep that transient event separate from Escape, tab changes and real focus loss.
export class GameFocusGuard {
  constructor({active,pause,clearInput,hidden,focused,modalOpen=()=>false,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}){
    Object.assign(this,{active,pause,clearInput,hidden,focused,modalOpen,now,setTimer,clearTimer});
    this.secondaryUntil=-Infinity;this.escapeUntil=-Infinity;this.timer=null;this.dismissUntil=-Infinity;
  }
  secondary(){this.secondaryUntil=this.now()+600;}
  escape(){this.escapeUntil=this.now()+600;}
  consumeEscape(){this.escapeUntil=-Infinity;this.dismissUntil=this.now()+600;this.regained();}
  regained(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
  acquired(){this.regained();this.escapeUntil=-Infinity;}
  pointerLost(programmatic=false){
    const escape=this.now()<this.escapeUntil;this.escapeUntil=-Infinity;
    const dismissed=this.now()<this.dismissUntil;this.dismissUntil=-Infinity;
    this.clearInput();if(programmatic||!this.active()||(dismissed||this.modalOpen())&&!this.hidden())return;
    if(this.hidden()||escape||this.now()>=this.secondaryUntil){this.pause();return;}
    if(!this.focused())this.blurred();
  }
  blurred(){
    this.clearInput();this.regained();if(!this.active())return;
    this.timer=this.setTimer(()=>{this.timer=null;if(this.active()&&(this.hidden()||!this.focused()))this.pause();},Math.max(100,this.secondaryUntil-this.now()+50));
  }
  visibilityChanged(){if(this.hidden()){this.regained();this.clearInput();if(this.active())this.pause();}}
}
