(function () {
  'use strict';
  const E = globalThis.ChatExport;
  const mono = 'ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace';
  const fonts = `--sans:Inter,"Segoe UI",Arial,sans-serif;--mono:${mono};--ink:#202020;--muted:#656565;--line:#dedede;--faint:#f6f6f6;`;
  // Original, static line drawing. No external font, image, animation or script.
  const paths = Array.from({ length: 9 }, (_, i) => `M ${-16 + i * 6} ${64 + i * 3} C ${44 + i * 3} ${-26 + i * 8}, ${76 - i * 3} ${134 - i * 8}, ${184 - i * 3} ${10 + i * 5}`).join('|');
  E.design = {
    addWire(doc, parent) {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 180 110'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('wire');
      for (const d of paths.split('|')) { const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.append(path); }
      parent.append(svg);
    },
    uiCSS: `
      :host{all:initial;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}
      .ce{${fonts}color-scheme:light;width:420px;max-width:calc(100vw - 24px);max-height:min(680px,calc(100dvh - 24px));display:flex;flex-direction:column;background:#fff;color:var(--ink);font:13px/1.55 var(--sans);border:1px solid var(--line);box-shadow:0 12px 46px #00000012;position:relative;overflow:hidden}
      .ce-popup{max-width:100%;max-height:600px;border:0;box-shadow:none}
      .head{padding:25px 24px 20px;position:relative;border-bottom:1px solid var(--line);flex-shrink:0}
      .head:before{content:"";position:absolute;left:12px;top:12px;width:9px;height:9px;border-left:1px solid #999;border-top:1px solid #999}
      .head .wire{position:absolute;right:0;top:7px;width:146px;height:110px;fill:none;stroke:#a8a8a8;stroke-width:.6;opacity:.32;pointer-events:none}
      .head h1{position:relative;font:400 25px/1.15 var(--sans);letter-spacing:-.045em;margin:14px 0 8px;max-width:315px}
      .kicker{position:relative;font:500 9px var(--mono);letter-spacing:.16em;color:var(--muted);text-transform:uppercase}
      .subtitle{position:relative;font-size:12px;margin:0;color:var(--muted)}
      button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #333;outline-offset:3px}
      button{border:1px solid #dadada;background:#fff;color:var(--ink);border-radius:24px;padding:8px 13px;transition:background .15s,border-color .15s}button:not(:disabled):hover{background:#f2f2f2;border-color:#999}
      .primary{background:#242424;border-color:#242424;color:#fff;font-weight:500}.primary:not(:disabled):hover{background:#444;border-color:#444}.danger{color:#444}
      .close{position:relative;z-index:1;float:right;background:#fff;border:0;border-radius:0;font-size:20px;padding:0 0 0 8px;line-height:1}
      .body{padding:18px 24px 20px;min-height:0;overflow:auto;overscroll-behavior:contain}
      .status{font-size:12px;white-space:pre-wrap;line-height:1.7;padding:0 0 14px;border-bottom:1px solid var(--line);margin-bottom:14px;overflow-wrap:anywhere}.status:first-line{font:500 10px var(--mono);letter-spacing:.08em;text-transform:uppercase}
      .notice{font-size:12px;color:#5f5240;white-space:pre-wrap;margin:9px 0;overflow-wrap:anywhere}.notice:empty{display:none}
      .controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0}.secondary{font:10px var(--mono);padding:6px 10px}
      .filters{display:flex;gap:2px;padding:4px;background:#f5f5f5;border:1px solid #eee;border-radius:30px;flex-wrap:nowrap;margin:10px 0 14px}
      .filters button{flex:1;border:0;background:transparent;padding:6px 5px;font-size:10px}.filters button[aria-pressed="true"]{background:#fff;box-shadow:0 1px 5px #0000000c}
      .settings{border-bottom:1px solid var(--line);margin-bottom:16px;padding-bottom:8px}.settings summary{cursor:pointer;font:10px var(--mono);letter-spacing:.06em;padding:6px 0}
      .options{display:grid;gap:11px;padding:14px 0 8px}label{display:flex;align-items:center;gap:9px}.options label{font-size:12px}.options input[type=number]{margin-left:auto}
      input[type=checkbox]{accent-color:#242424;width:13px;height:13px;flex-shrink:0}input[type=number]{width:74px;padding:5px;border:0;border-bottom:1px solid #bbb;background:#fafafa;border-radius:0;font:11px var(--mono)}
      select{padding:8px 6px;border:0;border-bottom:1px solid #aaa;border-radius:0;background:#fff;font-size:12px;max-width:155px}
      .selection{font:10px var(--mono);color:var(--muted);letter-spacing:.02em}.list{border-top:1px solid #888;border-bottom:1px solid var(--line);max-height:202px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#ccc #fff}
      .item{padding:12px 1px;align-items:flex-start;border-bottom:1px solid #ededed;gap:10px}.item:last-child{border:0}.item input{margin-top:2px}.item>span{min-width:0}
      .role{display:block;font:500 9px var(--mono);text-transform:uppercase;letter-spacing:.1em;color:#454545;margin-bottom:5px}.preview{display:block;font-size:12px;line-height:1.6;color:#626262;overflow-wrap:anywhere}
      .page{display:flex;justify-content:space-between;align-items:center;margin:10px 0;font:9px var(--mono);color:var(--muted)}.page button{padding:4px 8px;border:0;font:9px var(--mono)}
      .bottom{padding:16px 24px 18px;border-top:1px solid var(--line);background:#fff;flex-shrink:0}
      .export-row{display:flex;gap:14px;align-items:center}.export-row .primary{flex:1;padding:10px 14px}
      .footer{font:9px/1.6 var(--mono);color:#737373;margin-top:12px;white-space:pre-line}
      @media(prefers-reduced-motion:reduce){button{transition:none}}
    `,
    buttonCSS: 'font:500 11px ui-monospace,Consolas,monospace;letter-spacing:.035em;background:#fff;color:#252525;padding:11px 17px;border:1px solid #ddd;border-radius:28px;box-shadow:0 3px 18px #0000000d;cursor:pointer',
    readerCSS: `
      :root{${fonts}color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:16px/1.8 var(--sans)}main{max-width:1120px;margin:0 auto;padding:40px 48px 80px}
      .masthead{display:flex;justify-content:space-between;gap:20px;align-items:center;font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase;padding-bottom:22px;border-bottom:1px solid #a5a5a5}.masthead a{color:var(--muted);text-decoration:none}
      a{color:inherit;text-decoration-thickness:1px;text-underline-offset:3px;overflow-wrap:anywhere}a:hover{color:#666}
      .archive-header{padding:48px 0 30px;position:relative}.archive-header:before{content:"";position:absolute;top:24px;left:-18px;width:12px;height:12px;border-left:1px solid #aaa;border-top:1px solid #aaa}
      .archive-header .wire{position:absolute;right:-12px;top:24px;width:230px;height:142px;fill:none;stroke:#999;stroke-width:.5;opacity:.38;pointer-events:none}
      h1{position:relative;max-width:850px;font:400 clamp(28px,4vw,43px)/1.18 var(--sans);letter-spacing:-.045em;margin:0 0 28px;overflow-wrap:anywhere}
      .archive-meta{position:relative;display:flex;flex-wrap:wrap;gap:22px 40px;margin:0}.archive-meta div{min-width:95px}.archive-meta dt{font:9px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.archive-meta dd{margin:0;font-size:12px}
      .capture-note{font-size:11px;line-height:1.65;color:var(--muted);max-width:830px;margin:20px 0 0}.warning{font-size:12px;border-left:2px solid #999;padding:4px 0 4px 12px;color:#62543f;margin:12px 0}
      .message{display:grid;grid-template-columns:102px minmax(0,1fr);gap:30px;border-top:1px solid var(--line);padding:32px 0;overflow-wrap:anywhere}.message-heading{padding-top:5px}.message-index{font:10px var(--mono);color:#888;margin-bottom:10px;display:block}.message-heading h2{font:500 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;margin:0}
      .message-content{min-width:0}.message-content>div>div>p:first-child,.message-content>div>p:first-child,.message-content>p:first-child{margin-top:0}.message[data-role=user] .message-content{color:#595959}
      .message-content h3{font-size:24px;font-weight:500;line-height:1.35;letter-spacing:-.025em;margin:32px 0 14px}.message-content h4{font-size:19px;font-weight:500;line-height:1.4;margin:26px 0 12px}.message-content h5,.message-content h6{font-size:16px;font-weight:600;line-height:1.5;margin:24px 0 10px}.message-content h3 strong,.message-content h4 strong{font-weight:inherit}
      p{margin:0 0 17px}ul,ol{padding-left:24px;margin:12px 0 20px}li{padding-left:3px;margin:5px 0}li p{margin:5px 0}li>ul,li>ol{margin:5px 0 12px}strong{font-weight:600}
      pre{margin:20px 0;background:#f6f6f6;border:1px solid #e7e7e7;border-left:2px solid #999;padding:18px 20px;overflow:auto;font:13px/1.7 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}code{font: .88em var(--mono)}p code,li code{background:#f3f3f3;padding:2px 4px}pre code{font:inherit}
      blockquote{border-left:1px solid #aaa;padding-left:18px;margin:20px 0;color:#666}.table-wrap{overflow-x:auto;margin:24px 0;max-width:100%}table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.7;border-top:1px solid #888}th,td{border-bottom:1px solid #e4e4e4;padding:11px 12px;text-align:left;vertical-align:top}th{font-weight:500;background:#fafafa}th:first-child,td:first-child{padding-left:0}
      .math{font:13px/1.7 var(--mono);white-space:pre-wrap}.resource{font:11px/1.7 var(--mono);color:#747474}.image-link{display:block;margin:16px 0;font:11px var(--mono)}.resources{border-top:1px solid #eee;padding-top:12px;margin-top:20px}.resources h3{font:10px var(--mono);letter-spacing:.07em;text-transform:uppercase;margin:0 0 10px;color:#666}.resources ul{padding-left:16px;font-size:12px}.archive-footer{border-top:1px solid #999;padding-top:18px;margin-top:20px;font:9px/1.6 var(--mono);letter-spacing:.04em;color:#777}
      @media(max-width:650px){main{padding:24px 22px 48px}.masthead{font-size:9px}.archive-header{padding-top:36px}.archive-header .wire{width:160px;opacity:.2}.message{grid-template-columns:1fr;gap:15px;padding:25px 0}.message-heading{display:flex;gap:12px;align-items:center}.message-index{margin:0}.message-content h3{font-size:22px}.archive-meta{gap:16px 24px}pre{font-size:12px;padding:14px}.archive-header:before{left:-12px}}
      @media print{main{max-width:none;padding:0}body{font-size:11pt;line-height:1.65}.archive-header{padding:25px 0}.archive-header:before,.archive-header .wire{display:none}h1{font-size:25pt}.message{grid-template-columns:72px minmax(0,1fr);gap:20px;padding:22px 0;break-inside:auto}.message-content h3,.message-content h4{break-after:avoid}.message-content h3{font-size:16pt}.message-content h4{font-size:13pt}pre{font-size:9pt;white-space:pre-wrap}thead{display:table-header-group}tr{break-inside:avoid}.table-wrap{overflow:visible}a{color:#111}.archive-footer{font-size:8pt}}
    `
  };
  E.reader = archive => {
    const h = E.escapeHTML;
    const date = new Date(archive.exportedAt);
    const exported = Number.isNaN(date.getTime()) ? archive.exportedAt : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date);
    const count = `${archive.messages.length} ${archive.messages.length === 1 ? 'message' : 'messages'}`;
    const status = { 'observed-edges': 'Scan reached both ends', 'visible-only': 'Loaded messages only', partial: 'Partial capture' }[archive.capture.status] || archive.capture.status;
    const wire = `<svg class="wire" viewBox="0 0 180 110" aria-hidden="true">${paths.split('|').map(d => `<path d="${d}"/>`).join('')}</svg>`;
    const messages = archive.messages.map((m, i) => {
      const role = m.role === 'assistant' ? archive.provider.name : m.role === 'user' ? 'User' : m.role;
      const extraLinks = m.links.filter(link => !m.html.includes(h(link.url)));
      return `<article class="message" data-role="${h(m.role)}"><header class="message-heading"><span class="message-index">${String(i + 1).padStart(2, '0')}</span><h2>${h(role)}</h2></header><div class="message-content">${E.nestHTMLHeadings(m.html)}${m.attachments.map(a => `<p class="resource">${h(a.kind)}: ${h(a.name)}${a.url ? ` · <a href="${h(a.url)}" rel="noreferrer">File</a>` : ' · no downloadable URL exposed'}</p>`).join('')}${m.images.filter(im => !m.html.includes(h(im.url))).map(im => `<a class="image-link" href="${h(im.url)}" rel="noreferrer">Image: ${h(im.alt)}</a>`).join('')}${extraLinks.length ? '<section class="resources"><h3>Sources and links</h3><ul>' + extraLinks.map(l => `<li><a href="${h(l.url)}" rel="noreferrer">${h(l.title)}</a></li>`).join('') + '</ul></section>' : ''}${m.toolNotes.length ? `<section class="resources"><h3>Visible tool activity</h3>${m.toolNotes.map(t => `<p>${h(t)}</p>`).join('')}</section>` : ''}</div></article>`;
    }).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${h(archive.title)}</title><style>${E.design.readerCSS}</style></head><body><main><div class="masthead"><span>Conversation archive</span><a href="${h(archive.sourceURL)}" rel="noreferrer">Original conversation ↗</a></div><header class="archive-header">${wire}<h1>${h(archive.title)}</h1><dl class="archive-meta"><div><dt>Chatbot</dt><dd>${h(archive.provider.name)}</dd></div><div><dt>Exported</dt><dd><time datetime="${h(archive.exportedAt)}">${h(exported)}</time></dd></div><div><dt>Messages</dt><dd>${h(count)}${archive.selection && archive.selection.captured !== archive.messages.length ? ` of ${archive.selection.captured} captured` : ''}</dd></div><div><dt>Capture</dt><dd>${h(status)}</dd></div></dl><p class="capture-note">${h(archive.capture.note)}</p>${archive.capture.warnings.map(w => `<p class="warning">${h(w)}</p>`).join('')}</header>${messages}<footer class="archive-footer">Saved with Conversation Exporter · Images remain links · Print from your browser to save a PDF</footer></main></body></html>`;
  };
})(globalThis);
