// Panel styles, scoped inside the shadow root (:host defines the tokens). Ported
// from the approved mock, with every data-source cue removed — the shipped UI
// shows information, not where it came from.
export const PANEL_CSS = `
:host{
  --panel:#161B23; --panel2:#1E242E; --panel3:#242C38;
  --line:#2C3441; --line2:#3A4452; --ink:#E9EEF3; --muted:#96A2AF; --faint:#64707D;
  --accent:#27B6D6; --accent-deep:#1892AF; --accent-ink:#04222B;
  --deal:#54C48D; --warn:#E7A94C; --danger:#ED6A5A;
  --ui:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:"Cascadia Code",Consolas,"SFMono-Regular",Menlo,monospace;
}
*{box-sizing:border-box}
button{font-family:var(--ui);cursor:pointer}
button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

.sift{position:fixed;top:0;right:0;bottom:0;display:flex;flex-direction:column;font-family:var(--ui);color:var(--ink);
  background:var(--panel);border-left:1px solid var(--line);box-shadow:-18px 0 50px rgba(0,0,0,.45);z-index:2147483647}
.rz{position:absolute;left:0;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:5}
.rz::before{content:"";position:absolute;left:3px;top:50%;transform:translateY(-50%);width:2px;height:30px;border-radius:2px;background:var(--line2)}
.rz:hover::before{background:var(--accent);height:44px}
.rz-overlay{position:fixed;inset:0;z-index:2147483646;cursor:ew-resize}

.head{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--line);background:linear-gradient(var(--panel2),var(--panel))}
.brand{display:flex;align-items:center;gap:9px;font-weight:680}
.mark{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,var(--accent),var(--accent-deep));display:grid;place-items:center;color:var(--accent-ink);font:800 13px/1 var(--mono)}
.count{margin-left:auto;font:600 12px/1 var(--mono);color:var(--muted);background:var(--panel3);border:1px solid var(--line);border-radius:20px;padding:6px 10px}
.count b{color:var(--accent)}
.hbtn{font:600 11px var(--ui);padding:6px 10px;border-radius:7px;background:var(--panel3);border:1px solid var(--line2);color:var(--muted)}
.hbtn:hover{color:var(--ink);border-color:var(--muted)}
.hbtn.on{background:rgba(39,182,214,.16);border-color:var(--accent);color:#c3eef7}
.icon{width:30px;height:30px;display:grid;place-items:center;border-radius:7px;color:var(--muted);background:transparent;border:1px solid transparent;font-size:16px}
.icon:hover{background:var(--panel3);color:var(--ink)}

.ctx{padding:9px 14px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);background:#12161d}
.ctx b{color:var(--ink)}
.enrich{padding:7px 14px;font-size:11.5px;color:var(--accent);background:rgba(39,182,214,.07);border-bottom:1px solid var(--line)}

.sortbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid var(--line);background:#12161d}
.sortbar .flabel{margin-right:2px}

.scroll{flex:1;overflow-y:auto;overflow-x:hidden}
.scroll::-webkit-scrollbar{width:9px}
.scroll::-webkit-scrollbar-thumb{background:var(--line);border-radius:20px;border:2px solid var(--panel)}

.filters{padding:12px 14px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:11px}
.frow{display:flex;flex-direction:column;gap:6px}
.flabel{font:600 10.5px/1 var(--ui);letter-spacing:.11em;text-transform:uppercase;color:var(--faint)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:11px 14px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:12.5px;font-weight:550;background:var(--panel3);border:1px solid var(--line2);border-radius:7px;padding:5px 9px;color:var(--ink)}
.chip:hover{border-color:var(--muted)}
.chip.on{background:rgba(39,182,214,.16);border-color:var(--accent);color:#c3eef7}
.range{display:flex;align-items:center;gap:8px}
.range span{color:var(--faint)}
.inp{background:var(--panel2);border:1px solid var(--line2);border-radius:7px;padding:7px 9px;color:var(--ink);font:600 13px var(--mono);width:100%;min-width:0}
.inp::placeholder{color:var(--faint);font-weight:400}
.toggles{display:flex;flex-wrap:wrap;gap:12px 22px;padding-top:11px;border-top:1px solid var(--line)}
.toggle{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--ink);background:none;border:none;padding:0;text-align:left}
.toggle.off{color:var(--muted)}
.sw{width:34px;height:19px;border-radius:20px;background:var(--accent);position:relative;flex:none;transition:.15s}
.sw::after{content:"";position:absolute;top:2px;left:17px;width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s}
.toggle.off .sw{background:var(--line2)}
.toggle.off .sw::after{left:2px}

.banner{margin:12px 14px;border-radius:10px;padding:12px;font-size:12.5px}
.banner b{margin-bottom:3px}
.banner>div{color:var(--muted)}
.banner.error{background:rgba(237,106,90,.09);border:1px solid rgba(237,106,90,.4)}
.banner.error>b{display:block;color:#f39b91}
.banner.empty{background:var(--panel2);border:1px solid var(--line2)}
.banner.empty>b{display:block}

.results{list-style:none;margin:0;padding:10px 12px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:9px;align-content:start}
.card{display:grid;grid-template-columns:92px 1fr;gap:11px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:9px}
.card:hover{border-color:var(--line2)}
.card.unparsed{border-left:3px solid var(--warn)}
.thumb{position:relative;aspect-ratio:1/.86;border-radius:8px;overflow:hidden;background:#20262f;display:block}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.noimg{position:absolute;inset:0;display:grid;place-items:center;color:var(--faint);font-size:10px}
.badge.just{position:absolute;left:5px;top:5px;font:700 9px/1 var(--ui);padding:3px 5px;border-radius:5px;background:var(--deal);color:#0c2a1c}
.body{min-width:0;display:flex;flex-direction:column;gap:5px}
.title{font-size:12.5px;font-weight:600;line-height:1.3;color:var(--ink);text-decoration:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.title:hover{text-decoration:underline}
.facets{display:flex;flex-wrap:wrap;gap:4px}
.facet{font:600 10.5px/1 var(--mono);color:var(--muted);background:#141922;border:1px solid var(--line);border-radius:5px;padding:3px 5px}
.flag{font-size:11px;color:var(--warn)}
.dealrow{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.dealb{font:700 9px/1 var(--ui);letter-spacing:.03em;padding:3px 6px;border-radius:5px}
.dealb.great{background:var(--deal);color:#06231a}
.dealb.good{background:var(--accent);color:#04222b}
.dealb.high{background:rgba(231,169,76,.16);color:var(--warn);border:1px solid rgba(231,169,76,.35)}
.delta{font:600 10px/1 var(--mono);color:var(--deal)}
.meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.price{font:700 15px/1 var(--mono);color:var(--ink)}
.was{font:500 11px/1 var(--mono);color:var(--faint);text-decoration:line-through}
.miles{font:600 11px/1 var(--mono);color:var(--muted)}
.loc{margin-left:auto;font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}

.reopen{position:fixed;top:16px;right:0;display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-right:none;border-radius:10px 0 0 10px;padding:10px 12px;box-shadow:-8px 0 24px rgba(0,0,0,.35);z-index:2147483647;color:var(--ink)}
.reopen .mark{width:20px;height:20px}
.reopen b{color:var(--accent);font:700 12px var(--mono)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
