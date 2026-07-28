(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,938921,e=>{"use strict";var r=e.i(997053);let i=r.styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  margin-top: auto;
  gap: 16px;
  flex-grow: 100;
`,t=r.styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
  width: 100%;
`,o=r.styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`,a=(0,r.styled)(t)`
  padding: 20px 0;
`,n=(0,r.styled)(t)`
  gap: 16px;
`,l=r.styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`,s=r.styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;r.styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
`;let c=r.styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  text-align: left;
  gap: 8px;
  padding: 16px;
  margin-top: 16px;
  margin-bottom: 16px;
  width: 100%;
  background: var(--privy-color-background-2);
  border-radius: var(--privy-border-radius-md);
  && h4 {
    color: var(--privy-color-foreground-3);
    font-size: 14px;
    text-decoration: underline;
    font-weight: medium;
  }
  && p {
    color: var(--privy-color-foreground-3);
    font-size: 14px;
  }
`,d=r.styled.div`
  height: 16px;
`,h=r.styled.div`
  height: 12px;
`;r.styled.div`
  position: relative;
`;let p=r.styled.div`
  height: ${e=>e.height??"12"}px;
`;r.styled.div`
  background-color: var(--privy-color-accent);
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  border-color: white;
  border-width: 2px !important;
`,e.s(["B",()=>i,"C",()=>a,"F",()=>l,"H",()=>o,"R",()=>h,"S",()=>c,"a",()=>s,"b",()=>d,"c",()=>n,"d",()=>p,"e",()=>t])},355982,e=>{"use strict";let r=(0,e.i(773524).default)("copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);e.s(["Copy",()=>r],355982)},108313,e=>{"use strict";var r=e.i(843476),i=e.i(823209),t=e.i(355982),o=e.i(271645),a=e.i(997053),n=e.i(513153),l=e.i(355413);let s=({address:e,showCopyIcon:a,url:s,className:p})=>{let[u,v]=(0,o.useState)(!1);function g(r){r.stopPropagation(),navigator.clipboard.writeText(e).then(()=>v(!0)).catch(console.error)}return(0,o.useEffect)(()=>{if(u){let e=setTimeout(()=>v(!1),3e3);return()=>clearTimeout(e)}},[u]),(0,r.jsxs)(c,s?{children:[(0,r.jsx)(h,{title:e,className:p,href:`${s}/address/${e}`,target:"_blank",children:(0,n.D)(e)}),a&&(0,r.jsx)(l.S,{onClick:g,size:"sm",style:{gap:"0.375rem"},children:(0,r.jsxs)(r.Fragment,u?{children:["Copied",(0,r.jsx)(i.Check,{size:16})]}:{children:["Copy",(0,r.jsx)(t.Copy,{size:16})]})})]}:{children:[(0,r.jsx)(d,{title:e,className:p,children:(0,n.D)(e)}),a&&(0,r.jsx)(l.S,{onClick:g,size:"sm",style:{gap:"0.375rem",fontSize:"14px"},children:(0,r.jsxs)(r.Fragment,u?{children:["Copied",(0,r.jsx)(i.Check,{size:14})]}:{children:["Copy",(0,r.jsx)(t.Copy,{size:14})]})})]})},c=a.styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,d=a.styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,h=a.styled.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;e.s(["A",()=>s])},993556,e=>{"use strict";var r=e.i(271645);let i=r.forwardRef(function({title:e,titleId:i,...t},o){return r.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:o,"aria-labelledby":i},t),e?r.createElement("title",{id:i},e):null,r.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"}))});e.s(["default",0,i])},974935,e=>{"use strict";var r=e.i(271645);let i=r.forwardRef(function({title:e,titleId:i,...t},o){return r.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:o,"aria-labelledby":i},t),e?r.createElement("title",{id:i},e):null,r.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"}))});e.s(["default",0,i])},355413,e=>{"use strict";var r=e.i(843476),i=e.i(997053),t=e.i(345214),o=e.i(513153),a=e.i(993556),n=e.i(974935),l=e.i(271645);let s=l.forwardRef(function({title:e,titleId:r,...i},t){return l.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:t,"aria-labelledby":r},i),e?l.createElement("title",{id:r},e):null,l.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 18 18 6M6 6l12 12"}))});var c=e.i(515502);function d(e){return(0,r.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 460 40",...e,children:(0,r.jsx)("g",{fill:e.color||"var(--privy-color-foreground)",children:(0,r.jsx)("path",{d:"M0 15.4v15.38h4.64V19.96h3.58c2.47 0 3.63-.01 3.77-.02 1-.08 1.49-.15 2.18-.3a9.45 9.45 0 0 0 4.6-2.37c1.66-1.57 2.64-3.87 2.81-6.56.02-.3.02-1.19 0-1.49-.1-1.77-.56-3.35-1.36-4.72A8.84 8.84 0 0 0 15.14.57c-.93-.3-1.75-.43-3.09-.54C11.9.02 10.2 0 5.93 0H0ZM10.85 4c1.85.05 3.1.45 4.16 1.3.22.17.54.49.69.68a5.97 5.97 0 0 1 1.19 3.13c.04.35.04 1.36 0 1.71-.08.68-.23 1.3-.44 1.85a4.8 4.8 0 0 1-1.09 1.68A5.63 5.63 0 0 1 12 15.92c-.6.08-.4.08-4.01.09H4.64V3.98h2.9c1.6 0 3.08 0 3.31.02ZM187.65 5.71v5.72h-.27l-.09-.14a15.9 15.9 0 0 0-1.21-1.73c-.43-.5-1-.95-1.7-1.36-.54-.3-1.05-.5-1.73-.63a8.98 8.98 0 0 0-1.7-.17 8.84 8.84 0 0 0-7.8 4.03 12.95 12.95 0 0 0-2.03 6.39c-.07.98-.06 2.15.02 3.13.2 2.47.87 4.53 2.02 6.25a8.98 8.98 0 0 0 10.22 3.65 6.5 6.5 0 0 0 2.8-1.93c.41-.51.84-1.1 1.1-1.55l.1-.17h.37v3.58h4.38V0h-4.48Zm-5.24 5.54c1.3.14 2.3.6 3.17 1.48.9.9 1.5 2.09 1.85 3.64.36 1.6.39 3.72.06 5.43a8.13 8.13 0 0 1-1.54 3.62 5.1 5.1 0 0 1-3.93 1.96 6.13 6.13 0 0 1-2.32-.31 5.87 5.87 0 0 1-3.33-3.5c-.39-1-.62-2.05-.72-3.32-.03-.32-.04-1.35-.02-1.73.08-1.56.4-2.91.96-4.05a6.2 6.2 0 0 1 1.06-1.58 5.08 5.08 0 0 1 3.6-1.66c.25-.02.9 0 1.16.02ZM210.07 15.39l.01 15.38h4.38l.01-3.57h.37l.09.15c.24.44.84 1.26 1.21 1.7a6.79 6.79 0 0 0 2.57 1.75 9.3 9.3 0 0 0 6.86-.49 9.28 9.28 0 0 0 4.05-4.07A13.05 13.05 0 0 0 231 21.6c.21-1.73.18-3.7-.09-5.32a13.03 13.03 0 0 0-1.5-4.3 9.1 9.1 0 0 0-3.75-3.63 9.15 9.15 0 0 0-4.43-.96 7.46 7.46 0 0 0-2.8.5A7.07 7.07 0 0 0 216 9.7c-.4.52-.82 1.12-1.1 1.59l-.07.14h-.27V0h-4.5Zm11.13-4.14c1.07.1 1.94.44 2.7 1.04a6.1 6.1 0 0 1 1.64 1.98c.43.84.78 2 .94 3.11.15 1.16.16 2.4.02 3.54a9.34 9.34 0 0 1-1.39 4.03 5.33 5.33 0 0 1-2.69 2.15c-.9.3-2.04.38-3.06.2a5.14 5.14 0 0 1-3.45-2.37 6.03 6.03 0 0 1-.45-.8c-.5-1.03-.8-2.2-.92-3.58-.04-.49-.06-.89-.05-1.53.01-.76.05-1.23.13-1.85.38-2.53 1.47-4.38 3.15-5.31a5.46 5.46 0 0 1 2.3-.63 10 10 0 0 1 1.13.02ZM69.05 2.17l-.01 2.77V7.7h-3.36v3.6h3.36v6.8l.01 7.15c.06 1.4.4 2.44 1.1 3.37a5.8 5.8 0 0 0 2.97 2.07c.91.3 1.83.42 2.9.38a8.71 8.71 0 0 0 2.66-.48l-.8-3.7-.38.06a4.96 4.96 0 0 1-2.43-.06c-.33-.1-.56-.25-.8-.49-.4-.41-.6-.88-.7-1.67-.02-.2-.02-.62-.03-6.82v-6.6h4.73V7.7h-4.73V2.16h-4.49ZM133.34 2.17V7.7h-3.39v3.6h3.38v6.9l.01 7.17a5.66 5.66 0 0 0 2.36 4.49c.85.6 2.03 1.03 3.26 1.17.85.1 2.03.05 2.81-.1.3-.06.75-.18 1-.26l.2-.06v-.05l-.81-3.67-.37.06a4.99 4.99 0 0 1-1.8.09c-.85-.13-1.32-.4-1.7-.97a2.63 2.63 0 0 1-.39-1.04c-.06-.4-.06 0-.06-7.1V11.3h4.7V7.7h-4.7l-.01-2.77V2.16h-4.49ZM293.41 2.36a14.56 14.56 0 0 0-13.7 16.07 14.59 14.59 0 0 0 21.86 11.08 14.5 14.5 0 0 0 7.11-14.07 14.61 14.61 0 0 0-6.53-10.73 14.49 14.49 0 0 0-8.74-2.35ZM350.8 2.36a10.17 10.17 0 0 0-7.56 4.2c-.16.2-.45.63-.58.83l-.05.1h-.47l-.01-4.36h-7.36v36.4h7.82V27.27h.49l.05.07a11.3 11.3 0 0 0 7.49 4.15 10.52 10.52 0 0 0 9.38-4.1c1.66-2.1 2.73-4.9 3.07-8.06.1-.87.13-1.4.13-2.37 0-.8 0-1.1-.07-1.76a15.95 15.95 0 0 0-3.23-8.72 12.8 12.8 0 0 0-1.85-1.84 10.49 10.49 0 0 0-7.26-2.28Zm-.94 6.05c1.27.15 2.33.65 3.2 1.5.98.96 1.67 2.31 2.03 4 .34 1.57.38 3.68.12 5.39a9.78 9.78 0 0 1-1.04 3.25c-.14.25-.44.69-.6.89a5.35 5.35 0 0 1-4.31 2.07 5.25 5.25 0 0 1-4.41-1.9 7.35 7.35 0 0 1-1.26-2.32 14.09 14.09 0 0 1-.62-4.83c.05-1.98.38-3.53 1.02-4.85a5.63 5.63 0 0 1 2.5-2.65c.66-.34 1.3-.5 2.14-.58.18-.02 1.04 0 1.23.03ZM363.63 3.1l-.01 3.2v3.16h1.43c1.26.01 1.44.02 1.54.04.42.09.66.28.79.62.08.23.08.08.08 2.96a911.57 911.57 0 0 1 .03 10.18v7.54h7.82v-7.4l.01-7.83c.03-.94.11-1.63.27-2.28.46-1.9 1.54-2.93 3.35-3.23.52-.08.2-.08 5-.08h4.4V3.08h-3.1c-3.48 0-3.91.01-4.67.1-1.83.2-3.04.79-3.96 1.88-.5.6-.9 1.32-1.26 2.26l-.06.17h-.46V3.09h-5.6c-4.46 0-5.6 0-5.6.02ZM390.8 16.95V30.8h3.87l3.86-.01V3.09h-7.73ZM400.6 3.1l-.01.4v.38l4.66 13.4 4.69 13.47.02.05h10.3l.03-.05 4.67-13.45 4.67-13.4V3.1h-7.43l-6.7 19.26h-.5l-3.28-9.5-3.31-9.64-.05-.12h-3.88l-3.88.01ZM430.98 3.1c-.01 0-.02.19-.02.4v.39l5.08 14.59c2.8 8.02 5.08 14.6 5.08 14.61.01.02-.22.02-4.8.02h-4.82v6.42h4.95c5.09 0 5.23 0 5.87-.06 3.15-.28 5.29-1.63 6.63-4.15.28-.55.44-.95.87-2.16L459 6.78l1-2.89v-.8h-7.43l-6.69 19.26h-.5l-3.27-9.46-3.31-9.64-.06-.16h-3.88l-3.88.01ZM36.57 7.36c-1.36.1-2.6.6-3.62 1.45a5.65 5.65 0 0 0-1.67 2.42l-.05.13H31V7.7h-4.35v23.08h4.5v-7.3c0-8 0-7.34.08-7.82a4.89 4.89 0 0 1 2.06-3.18c.83-.58 1.74-.89 2.87-.98a11.87 11.87 0 0 1 2.8.25H39v-4.3l-.21-.02c-.61-.07-1.74-.1-2.22-.07ZM51.08 7.41c-2.33.12-4.3.84-5.95 2.16a9.89 9.89 0 0 0-2.03 2.2 12.5 12.5 0 0 0-2 5.78 18.04 18.04 0 0 0 0 3.65 12.13 12.13 0 0 0 2.26 6.05 9.74 9.74 0 0 0 5 3.52c2.11.64 4.7.64 6.8 0a9.78 9.78 0 0 0 4.88-3.37c1.38-1.78 2.19-4 2.4-6.58.13-1.46.06-3.06-.18-4.42a11.24 11.24 0 0 0-3.58-6.6 10 10 0 0 0-5.75-2.35c-.56-.06-1.31-.07-1.85-.04Zm1.42 3.78c.88.1 1.62.34 2.28.75a6.13 6.13 0 0 1 1.99 2.15 10.31 10.31 0 0 1 1.2 5c.02 1.23-.12 2.44-.42 3.51a7.14 7.14 0 0 1-1.81 3.32c-.61.6-1.2.98-1.95 1.24a6 6 0 0 1-2 .3 5.7 5.7 0 0 1-2.72-.6 5 5 0 0 1-1.28-.94A7.1 7.1 0 0 1 46 22.73c-.57-1.99-.6-4.46-.08-6.5a7.24 7.24 0 0 1 2.03-3.67 5.13 5.13 0 0 1 3.35-1.4 11 11 0 0 1 1.2.03ZM92.05 7.4c-.96.06-1.56.15-2.3.33a9.62 9.62 0 0 0-6.09 4.66 13.5 13.5 0 0 0-1.71 7c0 .83 0 1.04.06 1.6.16 1.77.58 3.32 1.29 4.7A9.72 9.72 0 0 0 90.28 31c1.84.37 4.08.32 5.85-.13a9.07 9.07 0 0 0 5.02-3.1A7.64 7.64 0 0 0 102.5 25l-2.11-.39-2.11-.38-.08.13a4.72 4.72 0 0 1-2.35 2.55 6.3 6.3 0 0 1-2.23.58c-.29.03-1.13.03-1.44 0a6.35 6.35 0 0 1-3.02-1.04 5.93 5.93 0 0 1-2.02-2.43 8.44 8.44 0 0 1-.72-3.18v-.26h16.38v-.81c0-1.83-.06-2.76-.25-3.87-.2-1.22-.53-2.24-1.05-3.28a8.9 8.9 0 0 0-2.66-3.26 10.1 10.1 0 0 0-5.34-1.94 18.3 18.3 0 0 0-1.46-.03Zm1.3 3.75c1.2.13 2.19.55 3.05 1.3a5.8 5.8 0 0 1 1.78 2.96c.13.51.21 1.17.21 1.66v.15H86.43v-.12c.08-.97.3-1.78.72-2.61.5-1 1.2-1.8 2.14-2.42a5.32 5.32 0 0 1 2.9-.95c.2-.01.97 0 1.17.03ZM116.79 7.41c-2 .1-3.73.65-5.22 1.65a10.7 10.7 0 0 0-4.25 6.06 16.1 16.1 0 0 0-.5 5.8c.2 2.17.84 4.13 1.88 5.76.58.9 1.32 1.73 2.15 2.4a9.37 9.37 0 0 0 3.6 1.8 12.06 12.06 0 0 0 3.92.34 10.2 10.2 0 0 0 3.84-.95 8.31 8.31 0 0 0 4.76-6.75l.01-.04h-4.37l-.05.16a4.87 4.87 0 0 1-4.24 3.75c-.59.07-1.32.06-1.93-.05a5.47 5.47 0 0 1-3.5-2.27c-.56-.75-1-1.73-1.26-2.79a13.8 13.8 0 0 1-.16-5.24 7.77 7.77 0 0 1 2.1-4.3 5.48 5.48 0 0 1 2.15-1.3 6.4 6.4 0 0 1 3.89.1c.59.21 1.03.5 1.5.96a5.32 5.32 0 0 1 1.46 2.5l.04.15h4.37v-.06a8.22 8.22 0 0 0-5.31-6.94 10.98 10.98 0 0 0-4.88-.74ZM156.2 7.41a9.87 9.87 0 0 0-6 2.29 11.02 11.02 0 0 0-3.41 5.43c-.52 1.78-.68 3.9-.48 5.97.17 1.8.63 3.38 1.37 4.8a9.68 9.68 0 0 0 5.91 4.86c1.65.48 3.63.61 5.53.36 3.72-.49 6.55-2.62 7.56-5.69.12-.39.13-.42.1-.43-.02 0-4.13-.75-4.19-.75-.03 0-.04 0-.1.16-.18.42-.45.9-.72 1.22-.16.2-.49.53-.7.7-.67.54-1.5.9-2.43 1.08-.48.08-.83.11-1.41.11-.64 0-1.07-.04-1.6-.15a5.76 5.76 0 0 1-3.93-2.83 8 8 0 0 1-.99-3.79v-.16h16.38v-1.11l-.02-1.43c-.1-2.25-.53-4-1.35-5.59a9.24 9.24 0 0 0-6.18-4.75c-1.04-.26-2.2-.36-3.33-.3Zm1.45 3.74a5.35 5.35 0 0 1 3.66 1.94 6.1 6.1 0 0 1 1.38 4.01v.12h-11.97v-.06c0-.02 0-.14.02-.25a6.6 6.6 0 0 1 2.15-4.32 5.73 5.73 0 0 1 3.5-1.46c.25-.02 1 0 1.26.02ZM233.58 7.82l8.37 23.22a49.22 49.22 0 0 1-.67 1.9 5.36 5.36 0 0 1-1.14 1.8c-.41.4-.82.58-1.48.69-.27.04-1.03.03-1.35 0a8.05 8.05 0 0 1-1.1-.23l-1.08 3.67c0 .02.32.14.66.22.83.21 1.57.29 2.56.28.56-.01.8-.03 1.24-.1 2.71-.4 4.66-2.09 5.86-5.08l9.64-26.44c0-.02-4.82-.06-4.83-.05l-2.93 8.96-2.91 8.94h-.24l-.22-.65-2.91-8.95-2.7-8.3H233.53ZM293.05 35.8c-1.18.04-1.93.09-2.8.16-2.52.24-4.53.69-5.43 1.23-.7.41-.76.86-.2 1.28.88.66 3.29 1.19 6.36 1.4a48.55 48.55 0 0 0 5.75.05c3.47-.19 6.24-.78 7.11-1.5.22-.19.3-.34.3-.53 0-.1 0-.12-.04-.22-.35-.69-2.32-1.3-5.25-1.63a41.09 41.09 0 0 0-5.8-.24Zm0 0"})})})}let h=i.styled.span`
  margin-top: 16px;
  font-size: 13px;
  text-align: center;
  color: var(--privy-color-foreground-3);
  display: block;

  && > a {
    color: var(--privy-color-accent);
  }
`;function p({app:{legal:{privacyPolicyUrl:e,termsAndConditionsUrl:i,requireUsersAcceptTerms:t}},alwaysShowImplicitConsent:o}){let a=!(!e||!i);return(!t||o)&&(i||e)?(0,r.jsxs)(h,{children:["By logging in I agree to the"," ",i&&(0,r.jsx)("a",{href:i,target:"_blank",children:a?"Terms":"Terms of Service"}),a&&" & ",e&&(0,r.jsx)("a",{href:e,target:"_blank",children:"Privacy Policy"})]}):(0,r.jsx)(h,{})}let u=({className:e})=>{let{appearance:i}=(0,t.u)();return(0,r.jsx)(g,{className:e,children:i.footerLogo??(0,r.jsx)(v,{href:"https://www.privy.io/",target:"_blank",id:"protected-by-privy",children:(0,r.jsx)(d,{color:"currentColor",height:13,width:150})})})},v=i.styled.a`
  && {
    padding: 0;
    color: var(--privy-color-foreground-3);
  }
`,g=i.styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 8px;
  padding-bottom: 12px;
  gap: 8px;

  font-size: 13px;

  && a {
    padding: 0.5rem 0;

    &:hover {
      text-decoration: none;
    }
  }

  @media all and (display-mode: standalone) {
    padding-bottom: 30px;
  }
`,f=({variant:e="primary",size:i="lg",children:t,success:o,...a})=>{switch(e){case"secondary":return(0,r.jsx)(j,{size:i,...a,children:t});case"error":return(0,r.jsx)(j,{$warn:!0,size:i,...a,children:t});case"muted":return(0,r.jsx)(C,{size:i,...a,children:t});default:return(0,r.jsx)(y,{size:i,success:o,...a,children:t})}},x=i.styled.button`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  user-select: none;

  & {
    width: auto;
    cursor: pointer;
    border-radius: ${({$size:e})=>"sm"===e?"6px":"var(--privy-border-radius-sm)"};

    font-size: 14px;
    font-style: normal;
    font-weight: 500;
    line-height: 22px;
    letter-spacing: -0.016px;
  }

  && {
    height: ${({$size:e})=>"sm"===e?"28px":"48px"};
    padding: 0 ${({$size:e})=>"sm"===e?"10px":"16px"};
  }
`,y=({children:e,loading:i,disabled:t,success:a,size:n="lg",loadingText:l="Loading...",as:s,onClick:c,...d})=>{let h="a"===s,p=!(!i&&!t);return(0,r.jsx)(b,{as:s,disabled:h?void 0:p,"aria-disabled":h?p:void 0,$success:a,$size:n,onClick:e=>{h&&p?e.preventDefault():c?.(e)},...d,children:i?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(o.G,{}),l?(0,r.jsx)("span",{style:{marginLeft:"8px"},children:l}):null]}):e})},m=({children:e,loading:i,disabled:t,...a})=>(0,r.jsx)(w,{disabled:t,...a,children:i?(0,r.jsx)(o.G,{color:"var(--privy-color-foreground-accent)"}):e}),w=(0,i.styled)(x)`
  position: relative;

  && {
    background-color: var(--privy-color-accent);
    color: var(--privy-color-foreground-accent);

    transition: background-color 200ms ease;
  }

  &:hover {
    background-color: var(--privy-color-accent-dark);
  }

  &:active {
    background-color: var(--privy-color-accent-dark);
  }

  &:disabled,
  &:hover:disabled,
  &:active:disabled {
    cursor: not-allowed;
    color: var(--privy-color-foreground-disabled);
    background-color: var(--privy-color-accent-dark);
  }
`,b=(0,i.styled)(x)`
  position: relative;

  && {
    background-color: ${e=>e.$warn?"var(--privy-color-error-dark)":"var(--privy-color-accent)"};
    color: var(--privy-color-foreground-accent);

    transition: background-color 200ms ease;
  }

  &:hover {
    background-color: ${e=>e.$warn?"var(--privy-color-error-dark)":"var(--privy-color-accent-dark)"};
  }

  &:active {
    background-color: ${e=>e.$warn?"var(--privy-color-error-dark)":"var(--privy-color-accent-dark)"};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px #949df9;
  }

  &:disabled {
    background-color: var(--privy-color-background-2);
    border: 1px solid var(--privy-color-border-default);
    color: var(--privy-color-foreground-disabled);
    cursor: not-allowed;
  }

  &:hover:disabled,
  &:active:disabled {
    background-color: var(--privy-color-background-2);
    border: 1px solid var(--privy-color-border-default);
    color: var(--privy-color-foreground-disabled);
    cursor: not-allowed;
  }

  /* Emulate disabled look for anchors via the prop */
  ${e=>e.disabled&&i.css`
      &&&,
      &&&:hover,
      &&&:active {
        background-color: var(--privy-color-background-2);
        border: 1px solid var(--privy-color-border-default);
        color: var(--privy-color-foreground-disabled);
        cursor: not-allowed;
      }
    `}
`,j=({children:e,loading:i,disabled:t,size:a="lg",loadingText:n="Loading...",as:l,onClick:s,...c})=>{let d="a"===l,h=!(!i&&!t);return(0,r.jsx)(k,{as:l,disabled:d?void 0:h,"aria-disabled":d?h:void 0,$size:a,onClick:e=>{d&&h?e.preventDefault():s?.(e)},...c,children:i?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(o.G,{}),n?(0,r.jsx)("span",{style:{marginLeft:"8px"},children:n}):null]}):e})},C=({children:e,loading:i,disabled:t,size:a="lg",loadingText:n="Loading...",as:l,onClick:s,...c})=>{let d="a"===l,h=!(!i&&!t);return(0,r.jsx)(F,{as:l,disabled:d?void 0:h,"aria-disabled":d?h:void 0,$size:a,onClick:e=>{d&&h?e.preventDefault():s?.(e)},...c,children:i?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(o.G,{}),n?(0,r.jsx)("span",{style:{marginLeft:"8px"},children:n}):null]}):e})},k=(0,i.styled)(x)`
  && {
    border-width: 1px;
    border-style: solid;
    border-color: ${e=>e.$warn?"var(--privy-color-border-error)":"var(--privy-color-accent)"};
    background-color: var(--privy-color-background);
    color: ${e=>e.$warn?"var(--privy-color-error-dark)":"var(--privy-color-accent)"};
    transition:
      border-color 200ms ease,
      color 200ms ease,
      background-color 200ms ease;
  }

  &:hover {
    border-color: ${e=>e.$warn?"var(--privy-color-border-error)":"var(--privy-color-border-interactive-hover)"};
    background-color: ${e=>e.$warn?"var(--privy-color-error-light)":"var(--privy-color-info-bg-hover)"};
    color: ${e=>e.$warn?"var(--privy-color-error-dark)":"var(--privy-color-accent)"};
  }

  &:active {
    border-color: ${e=>e.$warn?"var(--privy-color-border-error)":"var(--privy-color-border-interactive)"};
    background-color: ${e=>e.$warn?"var(--privy-color-error-bg-hover)":"var(--privy-color-info-bg)"};
    color: ${e=>e.$warn?"var(--privy-color-error-dark)":"var(--privy-color-accent)"};
  }

  &:disabled {
    border-color: var(--privy-color-border-default);
    background-color: var(--privy-color-background-2);
    color: var(--privy-color-foreground-disabled);
    cursor: not-allowed;
  }

  &:hover:disabled,
  &:active:disabled {
    border-color: var(--privy-color-border-default);
    background-color: var(--privy-color-background-2);
    color: var(--privy-color-foreground-disabled);
    cursor: not-allowed;
  }

  /* Anchor disabled look (prop-driven) */
  ${e=>e.disabled&&i.css`
      &&&,
      &&&:hover,
      &&&:active {
        border-color: var(--privy-color-border-default);
        background-color: var(--privy-color-background-2);
        color: var(--privy-color-foreground-disabled);
        cursor: not-allowed;
      }
    `}
`,F=(0,i.styled)(x)`
  && {
    border-width: 1px;
    border-style: solid;
    border-color: var(--privy-color-border-default);
    background-color: transparent;
    color: var(--privy-color-text-muted);

    transition:
      border-color 200ms ease,
      color 200ms ease,
      background-color 200ms ease;
  }

  &:hover {
    border-color: var(--privy-color-border-default);
    background-color: var(--privy-color-info-bg-hover);
    color: var(--privy-color-foreground-2);
  }

  &:active {
    border-color: var(--privy-color-border-default);
    background-color: var(--privy-color-info-bg);
    color: var(--privy-color-foreground-2);
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px #949df9;
  }

  &:disabled {
    border-color: var(--privy-color-border-default);
    background-color: var(--privy-color-background-2);
    color: var(--privy-color-foreground-disabled);
    cursor: not-allowed;
  }

  &:hover:disabled,
  &:active:disabled {
    border-color: var(--privy-color-border-default);
    background-color: var(--privy-color-background-2);
    color: var(--privy-color-foreground-disabled);
    cursor: not-allowed;
  }

  /* Anchor disabled look (prop-driven) */
  ${e=>e.disabled&&i.css`
      &&&,
      &&&:hover,
      &&&:active {
        border-color: var(--privy-color-border-default);
        background-color: var(--privy-color-background-2);
        color: var(--privy-color-foreground-disabled);
        cursor: not-allowed;
      }
    `}
`,L=i.styled.button`
  && {
    padding: 12px 16px;
    font-weight: 500;
    text-align: center;
    color: var(--privy-color-foreground-accent);
    background-color: var(--privy-color-accent);
    border-radius: var(--privy-border-radius-sm);
    min-width: 144px;
    opacity: ${e=>e.invisible?"0":"1"};
    transition:
      opacity 200ms ease,
      background-color 200ms ease,
      color 200ms ease;
    user-select: none;

    ${e=>e.invisible&&i.css`
        pointer-events: none;
      `}

    &:hover {
      background-color: var(--privy-color-accent-dark);
    }
    &:active {
      background-color: var(--privy-color-accent-dark);
    }

    &:hover:disabled,
    &:active:disabled {
      background-color: var(--privy-color-background-2);
      color: var(--privy-color-foreground-disabled);
      cursor: not-allowed;
    }
  }
`;i.styled.div`
  /* Set to match height of SoftCtaButton to avoid reflow if conditionally rendered */
  height: 44px;
`;let S=({children:e,onClick:i,disabled:t,isSubmitting:a,...n})=>(0,r.jsxs)($,{$isSubmitting:a,onClick:i,disabled:t,...n,children:[(0,r.jsx)("span",{children:e}),(0,r.jsx)("span",{children:(0,r.jsx)(o.G,{})})]}),$=i.styled.button`
  && {
    color: var(--privy-color-accent);
    font-size: 16px;
    font-style: normal;
    font-weight: 500;
    line-height: 24px;
    cursor: pointer;
    border-radius: 0px var(--privy-border-radius-mdlg) var(--privy-border-radius-mdlg) 0px;
    border: none;
    transition: color 200ms ease;

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
    }

    :hover {
      color: var(--privy-color-accent-dark);
    }

    && > :first-child {
      opacity: ${e=>+!e.$isSubmitting};
    }

    && > :last-child {
      position: absolute;
      display: flex;
      top: 50%;
      left: 50%;
      transform: translate3d(-50%, -50%, 0);

      /** Will map to the opposite of first span */
      opacity: ${e=>+!!e.$isSubmitting};
    }

    :disabled,
    :hover:disabled {
      color: var(--privy-color-foreground-disabled);
      cursor: not-allowed;
    }
  }
`,M=({backFn:e})=>(0,r.jsx)("div",{children:(0,r.jsx)(A,{onClick:e,children:(0,r.jsx)(a.default,{height:"16px",width:"16px",strokeWidth:2})})}),T=({infoFn:e})=>(0,r.jsx)("div",{children:(0,r.jsx)(I,{"aria-label":"info",onClick:e,children:(0,r.jsx)(n.default,{height:"22px",width:"22px",strokeWidth:2})})}),z=e=>(0,r.jsx)("div",{children:(0,r.jsx)(A,{"aria-label":"close modal",onClick:e.onClose,children:(0,r.jsx)(s,{height:"16px",width:"16px",strokeWidth:2})})}),E=({backFn:e,infoFn:i,onClose:o,title:a,closeable:n=!0,className:l})=>{let{closePrivyModal:s}=(0,c.u)(),d=(0,t.u)();return(0,r.jsxs)(V,{className:l,children:[(0,r.jsxs)(N,{children:[e&&(0,r.jsx)(M,{backFn:e}),(0,r.jsx)("div",{style:{height:24}}),i&&(0,r.jsx)(T,{infoFn:i})]}),a&&(0,r.jsx)(U,{id:"privy-dialog-title",children:a}),(0,r.jsx)(B,{children:!d.render.standalone&&n&&(0,r.jsx)(z,{onClose:o||(()=>s())})})]})},A=i.styled.button`
  && {
    cursor: pointer;
    display: flex;
    opacity: 0.6;

    background-color: var(--privy-color-background-2);
    border-radius: var(--privy-border-radius-full);
    padding: 4px;

    > svg {
      margin: auto;
      color: var(--privy-color-foreground);
    }

    :hover {
      opacity: 1;
    }
  }
`,I=(0,i.styled)(A)`
  && {
    background-color: transparent;
  }
`,V=i.styled.div`
  padding: 16px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    font-size: 16px;
    line-height: 24px;
    font-weight: 600;
    color: var(--privy-color-foreground);
  }
`,N=i.styled.div`
  flex: 1;
  align-items: center;
  display: flex;
  gap: 8px;
`,B=i.styled.div`
  flex: 1;
  display: flex;
  justify-content: flex-end;
`,U=i.styled.div`
  overflow: hidden;
  white-space: nowrap;
  max-width: 100%;
  text-overflow: ellipsis;
  text-align: center;
  color: var(--privy-color-foreground-2);
`;e.s(["B",()=>u,"E",()=>S,"M",()=>E,"P",()=>y,"S",()=>j,"T",()=>p,"a",()=>f,"b",()=>g,"c",()=>m,"d",()=>L],355413)},632964,e=>{"use strict";var r=e.i(843476),i=e.i(997053);let t=({size:e,centerIcon:i})=>(0,r.jsx)(o,{$size:e,children:(0,r.jsxs)(a,{children:[(0,r.jsx)(l,{}),(0,r.jsx)(s,{}),i?(0,r.jsx)(n,{children:i}):null]})}),o=i.styled.div`
  --spinner-size: ${e=>e.$size?e.$size:"96px"};

  display: inline-flex;
  justify-content: center;
  align-items: center;

  @media all and (display-mode: standalone) {
    margin-bottom: 30px;
  }
`,a=i.styled.div`
  position: relative;
  height: var(--spinner-size);
  width: var(--spinner-size);

  opacity: 1;
  animation: fadein 200ms ease;
`,n=i.styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  svg,
  img {
    width: calc(var(--spinner-size) * 0.4);
    height: calc(var(--spinner-size) * 0.4);
    border-radius: var(--privy-border-radius-full);
  }
`,l=i.styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: var(--spinner-size);
  height: var(--spinner-size);

  && {
    border: 4px solid var(--privy-color-border-default);
    border-radius: 50%;
  }
`,s=i.styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: var(--spinner-size);
  height: var(--spinner-size);
  animation: spin 1200ms linear infinite;

  && {
    border: 4px solid;
    border-color: var(--privy-color-icon-subtle) transparent transparent transparent;
    border-radius: 50%;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;e.s(["N",()=>t])},773524,e=>{"use strict";var r=e.i(271645);let i=e=>{let r=e.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,r,i)=>i?i.toUpperCase():r.toLowerCase());return r.charAt(0).toUpperCase()+r.slice(1)},t=(...e)=>e.filter((e,r,i)=>!!e&&""!==e.trim()&&i.indexOf(e)===r).join(" ").trim();var o={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};let a=(0,r.forwardRef)(({color:e="currentColor",size:i=24,strokeWidth:a=2,absoluteStrokeWidth:n,className:l="",children:s,iconNode:c,...d},h)=>(0,r.createElement)("svg",{ref:h,...o,width:i,height:i,stroke:e,strokeWidth:n?24*Number(a)/Number(i):a,className:t("lucide",l),...!s&&!(e=>{for(let r in e)if(r.startsWith("aria-")||"role"===r||"title"===r)return!0})(d)&&{"aria-hidden":"true"},...d},[...c.map(([e,i])=>(0,r.createElement)(e,i)),...Array.isArray(s)?s:[s]])),n=(e,o)=>{let n=(0,r.forwardRef)(({className:n,...l},s)=>(0,r.createElement)(a,{ref:s,iconNode:o,className:t(`lucide-${i(e).replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase()}`,`lucide-${e}`,n),...l}));return n.displayName=i(e),n};e.s(["default",()=>n],773524)},823209,e=>{"use strict";let r=(0,e.i(773524).default)("check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);e.s(["Check",()=>r],823209)},133225,e=>{"use strict";var r=e.i(997053);let i=r.keyframes`
  from, to {
    background: var(--privy-color-foreground-4);
    color: var(--privy-color-foreground-4);
  }

  50% {
    background: var(--privy-color-foreground-accent);
    color: var(--privy-color-foreground-accent);
  }
`,t=r.css`
  ${e=>e.$isLoading?r.css`
          width: 35%;
          animation: ${i} 2s linear infinite;
          border-radius: var(--privy-border-radius-sm);
        `:""}
`;e.s(["L",()=>t])},686466,e=>{"use strict";var r=e.i(271645),i=e.i(515502);let t="0x0000000000000000000000000000000000000000",o=({appId:e,originCurrency:r,destinationCurrency:i,...o})=>({tradeType:"EXPECTED_OUTPUT",originCurrency:r??t,destinationCurrency:i??t,referrer:`privy|${e}`,...o}),a="https://api.relay.link",n="https://api.testnets.relay.link",l=async({input:e,isTestnet:r})=>{let i=await fetch((r?n:a)+"/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)}),t=await i.json();if(!(i.ok||"string"==typeof t.message&&t.message.startsWith("Invalid address")))throw console.error("Relay error:",t),Error(t.message??"Error fetching quote from relay");return t},s=e=>{let r=e.steps[0]?.items?.[0];if(r)return{from:r.data.from,to:r.data.to,value:Number(r.data.value),chainId:Number(r.data.chainId),data:r.data.data}};async function c({transactionHash:e,isTestnet:r}){let i=await fetch((r?n:a)+"/requests/v2?hash="+e),t=await i.json();if(!i.ok){if("message"in t&&"string"==typeof t.message)throw Error(t.message);throw Error("Error fetching request from relay")}return t.requests.at(0)?.status??"pending"}function d({transactionHash:e,isTestnet:i,bridgingStatus:t,setBridgingStatus:o,onSuccess:a,onFailure:n}){(0,r.useEffect)(()=>{if(e&&t){if(["delayed","waiting","pending"].includes(t)){let r=setInterval(async()=>{try{let r=await c({transactionHash:e,isTestnet:i});o(r)}catch(e){console.error(e)}},1e3);return()=>clearInterval(r)}"success"===t?a({transactionHash:e}):["refund","failure"].includes(t)&&n({error:new h(e,i)})}},[t,e,i])}class h extends i.a{constructor(e,r){super("We were unable to complete the bridging transaction. Funds will be refunded on your wallet.",void 0,i.b.TRANSACTION_FAILURE),this.relayLink=r?`https://testnets.relay.link/transaction/${e}`:`https://relay.link/transaction/${e}`}}e.s(["R",()=>h,"a",()=>"11111111111111111111111111111111","b",()=>0x2f3fb341,"c",()=>s,"d",()=>"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","g",()=>l,"t",()=>o,"u",()=>d])},668375,577064,e=>{"use strict";var r=e.i(569934);class i extends r.BaseError{constructor({value:e}){super(`Number \`${e}\` is not a valid decimal number.`,{name:"InvalidDecimalNumberError"})}}function t(e,r){if(!/^(-?)([0-9]*)\.?([0-9]*)$/.test(e))throw new i({value:e});let[t,o="0"]=e.split("."),a=t.startsWith("-");if(a&&(t=t.slice(1)),o=o.replace(/(0+)$/,""),0===r)1===Math.round(Number(`.${o}`))&&(t=`${BigInt(t)+1n}`),o="";else if(o.length>r){let[e,i,a]=[o.slice(0,r-1),o.slice(r-1,r),o.slice(r)],n=Math.round(Number(`${i}.${a}`));(o=n>9?`${BigInt(e)+BigInt(1)}0`.padStart(e.length+1,"0"):`${e}${n}`).length>r&&(o=o.slice(1),t=`${BigInt(t)+1n}`),o=o.slice(0,r)}else o=o.padEnd(r,"0");return BigInt(`${a?"-":""}${t}${o}`)}e.s(["InvalidDecimalNumberError",()=>i],577064),e.s(["parseUnits",()=>t],668375)},599509,e=>{"use strict";var r=e.i(855723),i=e.i(668375);function t(e,o="wei"){return(0,i.parseUnits)(e,r.etherUnits[o])}e.s(["parseEther",()=>t])},652038,e=>{"use strict";var r=e.i(271645);let i=r.forwardRef(function({title:e,titleId:i,...t},o){return r.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:o,"aria-labelledby":i},t),e?r.createElement("title",{id:i},e):null,r.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"}))});e.s(["default",0,i])},377799,e=>{"use strict";e.s(["O",()=>"sdk_fiat_on_ramp_completed_with_status"])},629518,e=>{"use strict";var r=e.i(843476),i=e.i(336040),t=e.i(355413);function o({title:e}){let{currentScreen:o,navigateBack:a,navigate:n,data:l,setModalData:s}=(0,i.a)();return(0,r.jsx)(t.M,{title:e,backFn:"ManualTransferScreen"===o?a:o===l?.funding?.methodScreen?l.funding.comingFromSendTransactionScreen?()=>n("SendTransactionScreen"):void 0:l?.funding?.methodScreen?()=>{let e=l.funding;e.usingDefaultFundingMethod&&(e.usingDefaultFundingMethod=!1),s({funding:e,solanaFundingData:l?.solanaFundingData}),n(e.methodScreen)}:void 0})}e.s(["t",()=>o])},518139,e=>{"use strict";var r=e.i(271645);let i=r.forwardRef(function({title:e,titleId:i,...t},o){return r.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:o,"aria-labelledby":i},t),e?r.createElement("title",{id:i},e):null,r.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"}))});e.s(["default",0,i])},213444,e=>{"use strict";var r=e.i(843476),i=e.i(518139);let t=({icon:e,name:t})=>"string"==typeof e?(0,r.jsx)("img",{alt:`${t||"wallet"} logo`,src:e,style:{height:24,width:24,borderRadius:4}}):void 0===e?(0,r.jsx)(i.default,{style:{height:24,width:24}}):e?(0,r.jsx)(e,{style:{height:24,width:24}}):null;e.s(["I",()=>t])},72903,e=>{"use strict";var r=e.i(271645);let i=r.forwardRef(function({title:e,titleId:i,...t},o){return r.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:o,"aria-labelledby":i},t),e?r.createElement("title",{id:i},e):null,r.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"}))});e.s(["default",0,i])},810977,e=>{"use strict";var r=e.i(843476),i=e.i(997053);let t=({title:e,description:i,children:t,...o})=>(0,r.jsx)(a,{...o,children:(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("h3",{children:e}),"string"==typeof i?(0,r.jsx)("p",{children:i}):i,t]})});(0,i.styled)(t)`
  margin-bottom: 24px;
`;let o=({title:e,description:i,icon:t,children:o,...a})=>(0,r.jsxs)(n,{...a,children:[t||null,(0,r.jsx)("h3",{children:e}),i&&"string"==typeof i?(0,r.jsx)("p",{children:i}):i,o]}),a=i.styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  text-align: left;
  gap: 8px;
  width: 100%;
  margin-bottom: 24px;

  && h3 {
    font-size: 17px;
    color: var(--privy-color-foreground);
  }

  /* Sugar assuming children are paragraphs. Otherwise, handling styling on your own */
  && p {
    color: var(--privy-color-foreground-2);
    font-size: 14px;
  }
`,n=(0,i.styled)(a)`
  align-items: center;
  text-align: center;
  gap: 16px;

  h3 {
    margin-bottom: 24px;
  }
`;e.s(["C",()=>o,"S",()=>t])},921e3,e=>{"use strict";var r=e.i(997053);let i=r.styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
`,t=r.styled.span`
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 0.5rem;
`;e.s(["R",()=>t,"a",()=>i])},110696,e=>{"use strict";var r=e.i(997053),i=e.i(133225);let t=r.styled.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.375rem; /* 157.143% */
`,o=(0,r.styled)(t)`
  color: var(--privy-color-accent);
`,a=r.styled.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem; /* 157.143% */
  word-break: break-all;
  text-align: right;

  ${i.L}
`;e.s(["L",()=>t,"V",()=>a,"a",()=>o])},269674,75313,e=>{"use strict";var r=e.i(843476),i=e.i(997053),t=e.i(938921),o=e.i(355413),a=e.i(810977),n=e.i(629518),l=e.i(213444),s=e.i(632964),c=e.i(921e3),d=e.i(110696),h=e.i(108313),p=e.i(652038),u=e.i(209150),v=e.i(744645),g=e.i(707213),f=e.i(991120),x=e.i(538838),y=e.i(958747),m=e.i(83319),w=e.i(853317),b=e.i(331191);let j=e=>(0,r.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",version:"1.1",id:"Layer_1",x:"0px",y:"0px",viewBox:"0 0 397.7 311.7",enableBackground:"new 0 0 397.7 311.7",xmlSpace:"preserve",...e,children:[(0,r.jsxs)("linearGradient",{id:"SVGID_1_",gradientUnits:"userSpaceOnUse",x1:"360.8791",y1:"351.4553",x2:"141.213",y2:"-69.2936",gradientTransform:"matrix(1 0 0 -1 0 314)",children:[(0,r.jsx)("stop",{offset:"0",stopColor:"#00FFA3"}),(0,r.jsx)("stop",{offset:"1",stopColor:"#DC1FFF"})]}),(0,r.jsx)("path",{d:"M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5  c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z",fill:"url(#SVGID_1_)"}),(0,r.jsxs)("linearGradient",{id:"SVGID_2_",gradientUnits:"userSpaceOnUse",x1:"264.8291",y1:"401.6014",x2:"45.163",y2:"-19.1475",gradientTransform:"matrix(1 0 0 -1 0 314)",children:[(0,r.jsx)("stop",{offset:"0",stopColor:"#00FFA3"}),(0,r.jsx)("stop",{offset:"1",stopColor:"#DC1FFF"})]}),(0,r.jsx)("path",{d:"M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5  c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z",fill:"url(#SVGID_2_)"}),(0,r.jsxs)("linearGradient",{id:"SVGID_3_",gradientUnits:"userSpaceOnUse",x1:"312.5484",y1:"376.688",x2:"92.8822",y2:"-44.061",gradientTransform:"matrix(1 0 0 -1 0 314)",children:[(0,r.jsx)("stop",{offset:"0",stopColor:"#00FFA3"}),(0,r.jsx)("stop",{offset:"1",stopColor:"#DC1FFF"})]}),(0,r.jsx)("path",{d:"M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4  c5.8,0,8.7-7,4.6-11.1L333.1,120.1z",fill:"url(#SVGID_3_)"})]}),C={[b.arbitrum.id]:e=>(0,r.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",xmlnsXlink:"http://www.w3.org/1999/xlink",version:"1.1",id:"Layer_1",x:"0px",y:"0px",viewBox:"0 0 2500 2500",xmlSpace:"preserve",...e,children:(0,r.jsx)("g",{id:"Layer_x0020_1",children:(0,r.jsxs)("g",{id:"_2405588477232",children:[(0,r.jsx)("rect",{fill:"none",width:"2500",height:"2500"}),(0,r.jsx)("g",{children:(0,r.jsxs)("g",{children:[(0,r.jsx)("path",{fill:"#213147",d:"M226,760v980c0,63,33,120,88,152l849,490c54,31,121,31,175,0l849-490c54-31,88-89,88-152V760      c0-63-33-120-88-152l-849-490c-54-31-121-31-175,0L314,608c-54,31-87,89-87,152H226z"}),(0,r.jsx)("g",{children:(0,r.jsxs)("g",{children:[(0,r.jsx)("g",{children:(0,r.jsx)("path",{fill:"#12AAFF",d:"M1435,1440l-121,332c-3,9-3,19,0,29l208,571l241-139l-289-793C1467,1422,1442,1422,1435,1440z"})}),(0,r.jsx)("g",{children:(0,r.jsx)("path",{fill:"#12AAFF",d:"M1678,882c-7-18-32-18-39,0l-121,332c-3,9-3,19,0,29l341,935l241-139L1678,883V882z"})})]})}),(0,r.jsx)("g",{children:(0,r.jsx)("path",{fill:"#9DCCED",d:"M1250,155c6,0,12,2,17,5l918,530c11,6,17,18,17,30v1060c0,12-7,24-17,30l-918,530c-5,3-11,5-17,5       s-12-2-17-5l-918-530c-11-6-17-18-17-30V719c0-12,7-24,17-30l918-530c5-3,11-5,17-5l0,0V155z M1250,0c-33,0-65,8-95,25L237,555       c-59,34-95,96-95,164v1060c0,68,36,130,95,164l918,530c29,17,62,25,95,25s65-8,95-25l918-530c59-34,95-96,95-164V719       c0-68-36-130-95-164L1344,25c-29-17-62-25-95-25l0,0H1250z"})}),(0,r.jsx)("polygon",{fill:"#213147",points:"642,2179 727,1947 897,2088 738,2234     "}),(0,r.jsxs)("g",{children:[(0,r.jsx)("path",{fill:"#FFFFFF",d:"M1172,644H939c-17,0-33,11-39,27L401,2039l241,139l550-1507c5-14-5-28-19-28L1172,644z"}),(0,r.jsx)("path",{fill:"#FFFFFF",d:"M1580,644h-233c-17,0-33,11-39,27L738,2233l241,139l620-1701c5-14-5-28-19-28V644z"})]})]})})]})})}),[w.avalanche.id]:e=>(0,r.jsxs)("svg",{width:"1503",height:"1504",viewBox:"0 0 1503 1504",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:[(0,r.jsx)("rect",{x:"287",y:"258",width:"928",height:"844",fill:"white"}),(0,r.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M1502.5 752C1502.5 1166.77 1166.27 1503 751.5 1503C336.734 1503 0.5 1166.77 0.5 752C0.5 337.234 336.734 1 751.5 1C1166.27 1 1502.5 337.234 1502.5 752ZM538.688 1050.86H392.94C362.314 1050.86 347.186 1050.86 337.962 1044.96C327.999 1038.5 321.911 1027.8 321.173 1015.99C320.619 1005.11 328.184 991.822 343.312 965.255L703.182 330.935C718.495 303.999 726.243 290.531 736.021 285.55C746.537 280.2 759.083 280.2 769.599 285.55C779.377 290.531 787.126 303.999 802.438 330.935L876.42 460.079L876.797 460.738C893.336 489.635 901.723 504.289 905.385 519.669C909.443 536.458 909.443 554.169 905.385 570.958C901.695 586.455 893.393 601.215 876.604 630.549L687.573 964.702L687.084 965.558C670.436 994.693 661.999 1009.46 650.306 1020.6C637.576 1032.78 622.263 1041.63 605.474 1046.62C590.161 1050.86 573.004 1050.86 538.688 1050.86ZM906.75 1050.86H1115.59C1146.4 1050.86 1161.9 1050.86 1171.13 1044.78C1181.09 1038.32 1187.36 1027.43 1187.92 1015.63C1188.45 1005.1 1181.05 992.33 1166.55 967.307C1166.05 966.455 1165.55 965.588 1165.04 964.706L1060.43 785.75L1059.24 783.735C1044.54 758.877 1037.12 746.324 1027.59 741.472C1017.08 736.121 1004.71 736.121 994.199 741.472C984.605 746.453 976.857 759.552 961.544 785.934L857.306 964.891L856.949 965.507C841.69 991.847 834.064 1005.01 834.614 1015.81C835.352 1027.62 841.44 1038.5 851.402 1044.96C860.443 1050.86 875.94 1050.86 906.75 1050.86Z",fill:"#E84142"})]}),[m.base.id]:e=>(0,r.jsxs)("svg",{width:"146",height:"146",viewBox:"0 0 146 146",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:[(0,r.jsx)("circle",{cx:"73",cy:"73",r:"73",fill:"#0052FF"}),(0,r.jsx)("path",{d:"M73.323 123.729C101.617 123.729 124.553 100.832 124.553 72.5875C124.553 44.343 101.617 21.4463 73.323 21.4463C46.4795 21.4463 24.4581 42.0558 22.271 68.2887H89.9859V76.8864H22.271C24.4581 103.119 46.4795 123.729 73.323 123.729Z",fill:"white"})]}),[y.celo.id]:e=>(0,r.jsxs)("svg",{fill:"none",height:"400",viewBox:"0 0 400 400",width:"400",xmlns:"http://www.w3.org/2000/svg",...e,children:[(0,r.jsx)("path",{d:"m0 0h400v400h-400z",fill:"#fcff52"}),(0,r.jsx)("path",{d:"m300 100h-200v200h199.996v-69.813h-33.191c-11.442 25.468-37.194 43.206-66.665 43.206-40.63 0-73.533-33.187-73.533-73.533s32.903-73.249 73.533-73.249c30.043 0 55.795 18.313 67.24 44.349h32.62z",fill:"#000"})]}),[x.linea.id]:e=>(0,r.jsxs)("svg",{width:"200",height:"208",viewBox:"0 0 200 208",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:[(0,r.jsx)("rect",{width:"199.4",height:"207.623",fill:"#121212"}),(0,r.jsxs)("g",{"clip-path":"url(#clip0_2303_643)",children:[(0,r.jsx)("path",{d:"M132.369 155.99H49.7001V68.8854H68.6148V139.109H132.369V155.981V155.99Z",fill:"white"}),(0,r.jsx)("path",{d:"M132.369 85.7575C141.687 85.7575 149.241 78.2036 149.241 68.8855C149.241 59.5673 141.687 52.0134 132.369 52.0134C123.05 52.0134 115.497 59.5673 115.497 68.8855C115.497 78.2036 123.05 85.7575 132.369 85.7575Z",fill:"white"})]}),(0,r.jsx)("defs",{children:(0,r.jsx)("clipPath",{id:"clip0_2303_643",children:(0,r.jsx)("rect",{width:"99.5407",height:"103.977",fill:"white",transform:"translate(49.7001 52.0134)"})})})]}),[f.mainnet.id]:e=>(0,r.jsxs)("svg",{version:"1.1",id:"Layer_1",xmlns:"http://www.w3.org/2000/svg",xmlnsXlink:"http://www.w3.org/1999/xlink",x:"0px",y:"0px",viewBox:"0 0 327.5 533.3",enableBackground:"new 0 0 327.5 533.3;",xmlSpace:"preserve",...e,children:[(0,r.jsx)("path",{fill:"#8492B2",d:"M163.7,197.2V0L0,271.6L163.7,197.2z"}),(0,r.jsx)("path",{fill:"#62688F",d:"M163.7,368.4V197.2L0,271.6L163.7,368.4z M163.7,197.2l163.7,74.4L163.7,0V197.2z"}),(0,r.jsx)("path",{fill:"#454A75",d:"M163.7,197.2v171.2l163.7-96.8L163.7,197.2z"}),(0,r.jsx)("path",{fill:"#8492B2",d:"M163.7,399.4L0,302.7l163.7,230.7V399.4z"}),(0,r.jsx)("path",{fill:"#62688F",d:"M327.5,302.7l-163.8,96.7v134L327.5,302.7z"})]}),[g.optimism.id]:e=>(0,r.jsxs)("svg",{width:"500",height:"500",viewBox:"0 0 500 500",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:[(0,r.jsx)("circle",{cx:"250",cy:"250",r:"250",fill:"#FF0420"}),(0,r.jsx)("path",{d:"M177.133 316.446C162.247 316.446 150.051 312.943 140.544 305.938C131.162 298.808 126.471 288.676 126.471 275.541C126.471 272.789 126.784 269.411 127.409 265.408C129.036 256.402 131.35 245.581 134.352 232.947C142.858 198.547 164.812 181.347 200.213 181.347C209.845 181.347 218.476 182.973 226.107 186.225C233.738 189.352 239.742 194.106 244.12 200.486C248.498 206.74 250.688 214.246 250.688 223.002C250.688 225.629 250.375 228.944 249.749 232.947C247.873 244.08 245.621 254.901 242.994 265.408C238.616 282.546 231.048 295.368 220.29 303.874C209.532 312.255 195.147 316.446 177.133 316.446ZM179.76 289.426C186.766 289.426 192.707 287.362 197.586 283.234C202.59 279.106 206.155 272.789 208.281 264.283C211.158 252.524 213.348 242.266 214.849 233.51C215.349 230.883 215.599 228.194 215.599 225.441C215.599 214.058 209.657 208.366 197.774 208.366C190.768 208.366 184.764 210.43 179.76 214.558C174.882 218.687 171.379 225.004 169.253 233.51C167.001 241.891 164.749 252.149 162.498 264.283C161.997 266.784 161.747 269.411 161.747 272.163C161.747 283.672 167.752 289.426 179.76 289.426Z",fill:"white"}),(0,r.jsx)("path",{d:"M259.303 314.57C257.927 314.57 256.863 314.132 256.113 313.256C255.487 312.255 255.3 311.13 255.55 309.879L281.444 187.914C281.694 186.538 282.382 185.412 283.508 184.536C284.634 183.661 285.822 183.223 287.073 183.223H336.985C350.87 183.223 362.003 186.1 370.384 191.854C378.891 197.609 383.144 205.927 383.144 216.81C383.144 219.937 382.769 223.19 382.018 226.567C378.891 240.953 372.574 251.586 363.067 258.466C353.685 265.346 340.8 268.786 324.413 268.786H299.082L290.451 309.879C290.2 311.255 289.512 312.38 288.387 313.256C287.261 314.132 286.072 314.57 284.822 314.57H259.303ZM325.727 242.892C330.98 242.892 335.546 241.453 339.424 238.576C343.427 235.699 346.054 231.571 347.305 226.192C347.68 224.065 347.868 222.189 347.868 220.563C347.868 216.935 346.805 214.183 344.678 212.307C342.551 210.305 338.924 209.305 333.795 209.305H311.278L304.148 242.892H325.727Z",fill:"white"})]}),[v.polygon.id]:e=>(0,r.jsxs)("svg",{width:"360",height:"360",viewBox:"0 0 360 360",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:[(0,r.jsx)("rect",{width:"360",height:"360",rx:"180",fill:"#6C00F6"}),(0,r.jsx)("path",{d:"M157.743 154.241L141.052 144.58L90.9766 173.561V231.519L141.052 260.5L191.13 231.519V141.359L218.948 125.26L246.77 141.359V173.561L218.948 189.66L202.257 180.002V205.759L218.948 215.42L269.024 186.439V128.481L218.948 99.5L168.873 128.481V218.641L141.052 234.74L113.233 218.641V186.439L141.052 170.34L157.743 179.998V154.241Z",fill:"white"})]}),[u.zora.id]:e=>(0,r.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:"30",height:"30",viewBox:"0 0 30 30",fill:"none",...e,children:[(0,r.jsx)("g",{clipPath:"url(#clip0)",children:(0,r.jsx)("g",{clipPath:"url(#clip1)",children:(0,r.jsx)("path",{d:"M14.9188 29.8373C6.67944 29.8373 0.00012207 23.1581 0.00012207 14.9187C0.00012207 6.67931 6.67944 0 14.9188 0C23.1581 0 29.8373 6.67931 29.8373 14.9187C29.8373 23.1581 23.1581 29.8373 14.9188 29.8373Z",fill:"url(#paint0)"})})}),(0,r.jsxs)("defs",{children:[(0,r.jsxs)("radialGradient",{id:"paint0",cx:"0",cy:"0",r:"1",gradientUnits:"userSpaceOnUse",gradientTransform:"translate(21.6921 8.02215) rotate(180) scale(25.2008)",children:[(0,r.jsx)("stop",{offset:"0.00682297",stopColor:"#F2CEFE"}),(0,r.jsx)("stop",{offset:"0.1913",stopColor:"#AFBAF1"}),(0,r.jsx)("stop",{offset:"0.4982",stopColor:"#4281D3"}),(0,r.jsx)("stop",{offset:"0.666667",stopColor:"#2E427D"}),(0,r.jsx)("stop",{offset:"0.822917",stopColor:"#230101"}),(0,r.jsx)("stop",{offset:"1",stopColor:"#8F6B40"})]}),(0,r.jsx)("clipPath",{id:"clip0",children:(0,r.jsx)("rect",{width:"30",height:"30",fill:"white"})}),(0,r.jsx)("clipPath",{id:"clip1",children:(0,r.jsx)("rect",{width:"30",height:"30",fill:"white"})})]})]})},k=({chainId:e,...i})=>{if("solana"===e)return(0,r.jsx)(j,{...i});let t=C[e];return(0,r.jsx)(t||p.default,{...i})};e.s(["N",()=>k],75313);var F=e.i(513153);let L=({walletClientType:e,displayName:i,addressToFund:p,chainId:u,chainName:v,isBridging:g,isErc20Flow:f,totalPriceInNativeCurrency:x,totalPriceInUsd:y,gasPriceInNativeCurrency:m,gasPriceInUsd:w})=>{let b=(0,F.Q)(e);return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(n.t,{}),(0,r.jsx)(s.N,{centerIcon:(0,r.jsx)(l.I,{icon:b?.image_url?.md,name:e})}),(0,r.jsx)(a.C,{style:{marginTop:"8px",marginBottom:"12px"},title:`${g?"Bridging":"Confirming"} with ${i}`}),!g&&!f&&(0,r.jsxs)(c.a,{children:[(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Total"}),(0,r.jsx)(d.V,{children:y||x})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"To"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(h.A,{address:p,showCopyIcon:!1})})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Network"}),(0,r.jsx)(d.V,{children:(0,r.jsxs)(S,{children:[(0,r.jsx)(k,{chainId:u,height:16,width:16})," ",v]})})]}),m&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Estimated fee"}),(0,r.jsx)(d.V,{children:w||m})]})]}),(0,r.jsx)(t.d,{height:24}),(0,r.jsx)(o.B,{})]})},S=i.styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;e.s(["T",()=>L],269674)},513350,e=>{"use strict";var r=e.i(843476),i=e.i(72903),t=e.i(271645),o=e.i(599509),a=e.i(442690),n=e.i(938921),l=e.i(355413),s=e.i(810977),c=e.i(629518),d=e.i(632964),h=e.i(345214),p=e.i(515502),u=e.i(513153),v=e.i(336040),g=e.i(377799),f=e.i(686466),x=e.i(908350),y=e.i(269674),m=e.i(312463);e.i(123287),e.i(33750),e.i(595932);let w={component:function(){let e=(0,h.u)(),{closePrivyModal:w,createAnalyticsEvent:b,connectors:j}=(0,p.u)(),{navigate:C,setModalData:k,data:F}=(0,v.a)(),L=(0,h.u)(),S=(0,t.useRef)(!1),$=(0,x.c)(),[M,T]=(0,t.useState)(!1),[z,E]=(0,t.useState)(!1),[A,I]=(0,t.useState)(null),[V,N]=(0,t.useState)(),[B,U]=(0,t.useState)();if(!F?.funding||"ethereum"!==F.funding.chainType)throw Error("Invalid funding data");let{amount:Z,connectedWallet:_,chain:H,solanaChain:D,isUSDC:R}=F.funding,P=F.funding.address,W=F.funding.erc20Address,O=F.funding.isUSDC?"USDC":H.nativeCurrency.symbol,G=(0,t.useMemo)(()=>"solana"===_?.type?_.provider:function({connectors:e,connectedWalletAddress:r}){let i=e.find(e=>"solana"===e.chainType&&e.wallets.some(e=>e.address===r)),t=i?.wallet.accounts.find(e=>e.address===r);if(!i||!t)throw new p.a("Unable to find source wallet connector");return new a.ConnectedStandardSolanaWallet({wallet:i.wallet,account:t})}({connectors:j,connectedWalletAddress:_?.address||""}),[_,j]),q=(0,t.useMemo)(()=>{let r=$(x.S);if(!r)throw new p.a("Unable to load solana plugin");let i=e.solanaRpcs["solana:mainnet"];if(!i)throw new p.a("Unable to load mainnet RPC");return r.getSolanaRpcClient({rpc:i.rpc,rpcSubscriptions:i.rpcSubscriptions,chain:"solana:mainnet",blockExplorerUrl:i.blockExplorerUrl??"https://explorer.solana.com"})},[]),Q=(0,u.Q)((0,m.t)(G?.standardWallet.name||"unknown")),X=Q?.name||"wallet";return(0,t.useEffect)(()=>{(async function(){if(!G||!H||S.current)return;let e=$(x.S);if(!e)return void I(new p.a("Unable to solana plugin"));S.current=!0,H?.testnet&&console.warn("Solana testnets are not supported for bridging");let r=R?1e6*parseFloat(Z):(0,o.parseEther)(Z),i=await (0,f.g)({isTestnet:!!H.testnet,input:(0,f.t)({appId:L.id,amount:r.toString(),user:G.address,recipient:P,destinationChainId:H.id,originChainId:f.b,originCurrency:R?f.d:f.a,destinationCurrency:R?W:void 0})}).catch(console.error);if(!i)return void I(new p.a(`Unable to fetch quotes for bridging. Wallet ${(0,u.a6)(G.address)} does not have enough funds.`,void 0,p.b.INSUFFICIENT_BALANCE));let t=await e.createTransactionFromRelayQuote({quote:i,source:G.address,solanaClient:q});if(t)try{T(!0);let r=await e.simulateTransaction({solanaClient:q,tx:t});if(r.hasError)return r.hasFunds?(console.error("Transaction failed:",r.error),void I(new p.a("Something went wrong",void 0,p.b.TRANSACTION_FAILURE))):void I(new p.a(`Wallet ${(0,u.a6)(G?.address)} does not have enough funds. ${i.details.currencyIn.amountFormatted} ${O} are needed to complete the transaction.`,void 0,p.b.INSUFFICIENT_BALANCE));let{signature:o}=await G.signAndSendTransaction({chain:"solana:mainnet",transaction:t}),a=e.getAddressFromBuffer(o);N(a),U("pending")}catch(e){if(console.error(e),/user rejected the request/gi.test(e.message||""))return void I(new p.a("Transaction was rejected by the user",void 0,p.b.TRANSACTION_FAILURE));I(new p.a("Something went wrong",void 0,p.b.TRANSACTION_FAILURE))}else I(new p.a(`Unable to select bridge option from quotes. Wallet ${(0,u.a6)(G.address)} does not have enough funds.`,void 0,p.b.INSUFFICIENT_BALANCE))})().catch(console.error)},[]),(0,f.u)({transactionHash:V,isTestnet:!1,bridgingStatus:B,setBridgingStatus:U,onSuccess({transactionHash:e}){T(!1),E(!0),b({eventName:g.O,payload:{provider:"external",status:"success",txHash:e,address:G.address,chainType:"solana",clusterName:D,token:"SOL",destinationAddress:P,destinationChainId:H.id,destinationChainType:"ethereum",destinationValue:Z,destinationToken:R?"USDC":"ETH"}})},onFailure({error:e}){T(!1),I(e)}}),(0,t.useEffect)(()=>{if(!z)return;let e=setTimeout(w,h.t);return()=>clearTimeout(e)},[z]),(0,t.useEffect)(()=>{A&&(k({funding:F?.funding,solanaFundingData:F?.solanaFundingData,sendTransaction:F?.sendTransaction,errorModalData:{error:A,previousScreen:"TransferFromWalletScreen"}}),C("ErrorScreen",!1))},[A]),z?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(c.t,{}),(0,r.jsx)(n.b,{}),(0,r.jsxs)(n.c,{children:[(0,r.jsx)(i.default,{color:"var(--privy-color-success)",width:"64px",height:"64px"}),(0,r.jsx)(s.C,{title:"Success!",description:`You’ve successfully added ${Z} ${O} to your ${L.name} wallet. It may take a minute before the funds are available to use.`})]}),(0,r.jsx)(n.R,{}),(0,r.jsx)(l.B,{})]}):M&&G?(0,r.jsx)(y.T,{walletClientType:(0,m.t)(G?.standardWallet.name||"unknown"),displayName:X,addressToFund:P,isBridging:M,isErc20Flow:!1,chainId:H.id,chainName:H.name,totalPriceInUsd:void 0,totalPriceInNativeCurrency:void 0,gasPriceInUsd:void 0,gasPriceInNativeCurrency:void 0}):(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(c.t,{}),(0,r.jsx)(d.N,{}),(0,r.jsx)("div",{style:{marginTop:"1rem"}}),(0,r.jsx)(l.B,{})]})}};e.s(["AwaitingSolToEvmBridgingScreen",()=>w,"default",()=>w])}]);