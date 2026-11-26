// Shadow-DOM styles for the badge and panel (Priority look). Classic script:
// sets globalThis.PWStyles. Kept in JS so it can be adopted as a constructed
// stylesheet, which page CSP cannot block.
globalThis.PWStyles = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.pw {
  --band: #24170e; --paper: #efe7da; --panel: #fffdf9; --inset: #f7f1e7;
  --cream: #f4ead8; --cream-h: #ecdcc0; --text: #2a1b10; --copy: #3b2a1e;
  --subtle: #6b5641; --muted: #8a7560; --accent: #9a6b2f; --accent-h: #7d5522;
  --gold: #c9a063; --bar: #a8813f; --focus: #b8873f; --line: #e3d8c6; --line-m: #efe6d8;
  --ctl: #c9b79c; --danger: #a63d2a; --ok: #4f7a3a; --hover: rgba(74,46,20,.06);
  --del-bg: #f6d9d2; --del-fg: #9a3a28; --ins-bg: #f3e2bf; --ins-fg: #3d2a10;
  --shadow: 0 10px 30px rgba(74,46,20,.22), 0 2px 6px rgba(74,46,20,.12);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
}
@media (prefers-color-scheme: dark) {
  .pw {
    --paper: #1c130c; --panel: #22170f; --inset: #18100a; --cream: #3a2816; --cream-h: #4a331c;
    --text: #efe3cf; --copy: #e3d5bd; --subtle: #c4ae8c; --muted: #a38d70; --accent: #d4ae6f;
    --accent-h: #e6c68f; --focus: #d4ae6f; --line: #3d2b1d; --line-m: #2f2116; --ctl: #6b5440;
    --danger: #e88a74; --ok: #8fc27a; --hover: rgba(232,200,150,.07);
    --del-bg: #4a2219; --del-fg: #f0a493; --ins-bg: #4a3517; --ins-fg: #f3e2bf;
    --shadow: 0 10px 30px rgba(0,0,0,.5), 0 0 0 1px rgba(201,160,99,.18);
  }
}

/* Badge */
.badge {
  position: fixed; z-index: 2147483647; width: 22px; height: 22px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--band); color: var(--gold); border: 1px solid var(--bar); border-radius: 50%;
  font: 700 11px/1 system-ui, sans-serif; letter-spacing: 0; cursor: pointer;
  box-shadow: 0 1px 4px rgba(36,23,14,.35); transition: opacity .15s, transform .15s;
}
.badge:hover { transform: translateY(-1px); border-color: var(--gold); }
.badge:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.badge svg { width: 13px; height: 13px; display: block; }
.badge[data-state="issues"] { background: var(--gold); color: var(--band); border-color: var(--gold); }
.badge[data-state="error"] { color: #f0a493; border-color: #a63d2a; }
.badge[data-state="checking"] svg { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Panel */
.panel {
  position: fixed; z-index: 2147483647; width: 400px; max-width: calc(100vw - 16px);
  max-height: min(560px, calc(100vh - 16px)); display: flex; flex-direction: column;
  background: var(--panel); border-radius: 3px; box-shadow: var(--shadow); overflow: hidden;
}
.head {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  background: var(--band); color: #f3e6cf; border-bottom: 2px solid var(--gold);
}
.brand { font-weight: 700; font-size: 13px; letter-spacing: .02em; }
.brand small {
  display: block; color: var(--gold); font-size: 9px; font-weight: 600;
  letter-spacing: .24em; text-transform: uppercase; margin-top: 1px;
}
.model {
  flex: 1; min-width: 0; text-align: right; color: #a8936f; font-size: 10px;
  letter-spacing: .08em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.icon-btn {
  background: none; border: 1px solid transparent; color: #c9b28a; width: 24px; height: 24px;
  border-radius: 2px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
}
.icon-btn:hover { border-color: #5a4430; color: #f3e6cf; }
.icon-btn svg { width: 14px; height: 14px; }

.tabs { display: flex; border-bottom: 1px solid var(--line); background: var(--panel); }
.tab {
  flex: 1; background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px;
  padding: 9px 8px 8px; cursor: pointer; color: var(--muted);
  font: 600 10px/1 system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase;
}
.tab:hover { color: var(--accent); }
.tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--bar); }
.tab .count {
  display: inline-block; min-width: 16px; padding: 2px 4px; margin-left: 6px; border-radius: 2px;
  background: var(--ins-bg); color: var(--accent-h); letter-spacing: 0;
}

.body { flex: 1; overflow: auto; padding: 12px; background: var(--paper); }
.label {
  display: flex; align-items: center; justify-content: space-between; margin: 0 0 6px;
  color: var(--accent); font-size: 10px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase;
}
.label .link { letter-spacing: .12em; }
.text {
  background: var(--panel); border: 1px solid var(--line); border-top: 2px solid var(--gold);
  border-radius: 2px; padding: 10px 12px; color: var(--copy); white-space: pre-wrap;
  overflow-wrap: anywhere; max-height: 210px; overflow: auto; font-size: 13.5px; line-height: 1.55;
}
.hunk { cursor: pointer; border-radius: 1px; }
.hunk del { background: var(--del-bg); color: var(--del-fg); text-decoration: line-through; padding: 0 1px; }
.hunk ins { background: var(--ins-bg); color: var(--ins-fg); text-decoration: none; padding: 0 1px; box-shadow: inset 0 -1px 0 var(--bar); }
.hunk.off { text-decoration: underline dotted var(--muted); text-underline-offset: 3px; }
.hunk:hover del, .hunk:hover ins { outline: 1px solid var(--bar); }
.hunk.active del, .hunk.active ins { outline: 2px solid var(--focus); }
.clean .hunk del { display: none; }
.clean .hunk ins { background: none; box-shadow: none; }

.edits { list-style: none; margin: 12px 0 0; padding: 0; }
.edit {
  display: grid; grid-template-columns: auto 1fr auto; gap: 2px 10px; align-items: baseline;
  padding: 8px 10px; margin-top: 6px; background: var(--panel); border: 1px solid var(--line-m);
  border-left: 3px solid var(--gold); border-radius: 2px; cursor: pointer;
}
.edit:hover { background: var(--cream); }
.edit.off { border-left-color: var(--line); opacity: .65; }
.edit .type { color: var(--accent); font-size: 9px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
.edit .change { color: var(--copy); overflow-wrap: anywhere; }
.edit .change s { color: var(--del-fg); }
.edit .change b { font-weight: 600; }
.edit .why { grid-column: 2 / 4; color: var(--subtle); font-size: 12px; }
.edit .state { color: var(--muted); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }

.empty { padding: 22px 8px; text-align: center; color: var(--subtle); }
.empty strong { display: block; color: var(--text); font-size: 14px; margin-bottom: 4px; }
.mark { color: var(--gold); font-size: 22px; display: block; margin-bottom: 6px; }
.error {
  margin-top: 10px; padding: 8px 10px; border-left: 3px solid var(--danger); background: var(--panel);
  color: var(--danger); border-radius: 2px; overflow-wrap: anywhere;
}
.spinner {
  width: 18px; height: 18px; margin: 0 auto 10px; border: 2px solid var(--line);
  border-top-color: var(--bar); border-radius: 50%; animation: spin .8s linear infinite;
}

.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.chip {
  padding: 5px 9px; border: 1px solid var(--ctl); border-radius: 2px; background: var(--panel);
  color: var(--copy); font: 12px/1.2 system-ui, sans-serif; cursor: pointer;
}
.chip:hover { background: var(--cream); }
.chip[aria-pressed="true"] { background: var(--band); color: #f3e6cf; border-color: var(--band); }
@media (prefers-color-scheme: dark) {
  .chip[aria-pressed="true"] { background: var(--gold); color: var(--band); border-color: var(--gold); }
}
.slider { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; margin-bottom: 6px; }
.slider span { color: var(--muted); font-size: 11px; }
.slider input { width: 100%; accent-color: var(--bar); }
.level { text-align: center; color: var(--copy); font-weight: 600; margin-bottom: 14px; }

.foot {
  display: flex; gap: 8px; align-items: center; padding: 10px 12px;
  border-top: 1px solid var(--line); background: var(--panel);
}
.foot .spacer { flex: 1; }
.btn {
  padding: 7px 12px; border-radius: 2px; border: 1px solid var(--ctl); background: var(--cream);
  color: var(--text); font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer;
}
.btn:hover { background: var(--cream-h); }
.btn:focus-visible, .chip:focus-visible, .tab:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.btn.primary { background: var(--band); border-color: var(--band); color: #f3e6cf; }
.btn.primary:hover { background: #3a2816; }
@media (prefers-color-scheme: dark) {
  .btn.primary { background: var(--gold); border-color: var(--gold); color: var(--band); }
  .btn.primary:hover { background: #d4ae6f; }
}
.btn:disabled { opacity: .5; cursor: default; }
.link {
  background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer;
  font: 600 10px/1 system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase;
}
.link:hover { color: var(--accent-h); }
.note { color: var(--muted); font-size: 11px; }

/* GitHub light theme (Settings → Appearance). Always light, ignores the OS dark mode. */
.pw[data-theme="github"] {
  --band: #f6f8fa; --paper: #ffffff; --panel: #ffffff; --inset: #f6f8fa;
  --cream: #f6f8fa; --cream-h: #eff2f5; --text: #1f2328; --copy: #1f2328;
  --subtle: #59636e; --muted: #59636e; --accent: #0969da; --accent-h: #0550ae;
  --gold: #d0d7de; --bar: #0969da; --focus: #0969da; --line: #d0d7de; --line-m: #d8dee4;
  --ctl: #d0d7de; --danger: #d1242f; --ok: #1a7f37; --hover: rgba(208,215,222,.32);
  --del-bg: #ffebe9; --del-fg: #82071e; --ins-bg: #dafbe1; --ins-fg: #116329;
  --shadow: 0 8px 24px rgba(140,149,159,.2), 0 0 0 1px #d0d7de;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
}
.pw[data-theme="github"] .badge { background: #fff; color: #59636e; border-color: #d0d7de; box-shadow: 0 1px 3px rgba(31,35,40,.12); }
.pw[data-theme="github"] .badge:hover { border-color: #0969da; color: #0969da; }
.pw[data-theme="github"] .badge[data-state="checking"] { color: #0969da; }
.pw[data-theme="github"] .badge[data-state="issues"] { background: #0969da; color: #fff; border-color: #0969da; }
.pw[data-theme="github"] .badge[data-state="clean"] { color: #1a7f37; }
.pw[data-theme="github"] .badge[data-state="error"] { color: #d1242f; border-color: #d1242f; }
.pw[data-theme="github"] .panel { border-radius: 12px; }
.pw[data-theme="github"] .head { color: var(--text); border-bottom: 1px solid var(--line); }
.pw[data-theme="github"] .brand small { color: var(--muted); letter-spacing: 0; text-transform: none; font-weight: 400; font-size: 11px; }
.pw[data-theme="github"] .model { color: var(--muted); letter-spacing: 0; }
.pw[data-theme="github"] .icon-btn { color: var(--muted); border-radius: 6px; }
.pw[data-theme="github"] .icon-btn:hover { background: var(--hover); border-color: transparent; color: var(--text); }
.pw[data-theme="github"] .tab { font-size: 13px; letter-spacing: 0; text-transform: none; color: var(--muted); }
.pw[data-theme="github"] .tab:hover { color: var(--text); }
.pw[data-theme="github"] .tab[aria-selected="true"] { color: var(--text); border-bottom-color: #fd8c73; }
.pw[data-theme="github"] .tab .count { border-radius: 2em; background: rgba(175,184,193,.2); color: var(--text); }
.pw[data-theme="github"] .label { color: var(--text); font-size: 12px; letter-spacing: 0; text-transform: none; }
.pw[data-theme="github"] .text { border-top-width: 1px; border-top-color: var(--line); border-radius: 6px; }
.pw[data-theme="github"] .edit { border-left-width: 1px; border-left-color: var(--line); border-radius: 6px; }
.pw[data-theme="github"] .edit:hover { background: var(--inset); }
.pw[data-theme="github"] .edit .type { color: var(--accent); letter-spacing: .02em; }
.pw[data-theme="github"] .edit .state { letter-spacing: 0; text-transform: none; }
.pw[data-theme="github"] .error { border: 1px solid rgba(255,129,130,.4); background: #ffebe9; color: var(--danger); border-radius: 6px; }
.pw[data-theme="github"] .mark { color: var(--ok); }
.pw[data-theme="github"] .chip { border-radius: 2em; }
.pw[data-theme="github"] .chip:hover { background: var(--inset); }
.pw[data-theme="github"] .chip[aria-pressed="true"] { background: #ddf4ff; color: #0969da; border-color: #54aeff; }
.pw[data-theme="github"] .btn {
  border-radius: 6px; border-color: rgba(31,35,40,.15); background: #f6f8fa; color: var(--text);
  box-shadow: 0 1px 0 rgba(31,35,40,.04); font-weight: 500;
}
.pw[data-theme="github"] .btn:hover { background: #eff2f5; border-color: rgba(31,35,40,.15); }
.pw[data-theme="github"] .btn.primary { background: #1f883d; border-color: rgba(31,35,40,.15); color: #fff; }
.pw[data-theme="github"] .btn.primary:hover { background: #1a7f37; }
.pw[data-theme="github"] .link { letter-spacing: 0; text-transform: none; font-size: 12px; font-weight: 500; }
.pw[data-theme="github"] .link:hover { text-decoration: underline; }
`;
