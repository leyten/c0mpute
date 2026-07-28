(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,938921,e=>{"use strict";var r=e.i(997053);let o=r.styled.div`
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
`,i=r.styled.div`
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
`,u=r.styled.div`
  height: 12px;
`;r.styled.div`
  position: relative;
`;let v=r.styled.div`
  height: ${e=>e.height??"12"}px;
`;r.styled.div`
  background-color: var(--privy-color-accent);
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  border-color: white;
  border-width: 2px !important;
`,e.s(["B",()=>o,"C",()=>a,"F",()=>l,"H",()=>i,"R",()=>u,"S",()=>c,"a",()=>s,"b",()=>d,"c",()=>n,"d",()=>v,"e",()=>t])},245953,(e,r,o)=>{"use strict";var t={single_source_shortest_paths:function(e,r,o){var i,a,n,l,s,c,d,u={},v={};v[r]=0;var p=t.PriorityQueue.make();for(p.push(r,0);!p.empty();)for(n in a=(i=p.pop()).value,l=i.cost,s=e[a]||{})s.hasOwnProperty(n)&&(c=l+s[n],d=v[n],(void 0===v[n]||d>c)&&(v[n]=c,p.push(n,c),u[n]=a));if(void 0!==o&&void 0===v[o])throw Error("Could not find a path from "+r+" to "+o+".");return u},extract_shortest_path_from_predecessor_list:function(e,r){for(var o=[],t=r;t;)o.push(t),e[t],t=e[t];return o.reverse(),o},find_path:function(e,r,o){var i=t.single_source_shortest_paths(e,r,o);return t.extract_shortest_path_from_predecessor_list(i,o)},PriorityQueue:{make:function(e){var r,o=t.PriorityQueue,i={};for(r in e=e||{},o)o.hasOwnProperty(r)&&(i[r]=o[r]);return i.queue=[],i.sorter=e.sorter||o.default_sorter,i},default_sorter:function(e,r){return e.cost-r.cost},push:function(e,r){this.queue.push({value:e,cost:r}),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return 0===this.queue.length}}};r.exports=t},456842,e=>{"use strict";var r=e.i(997053);let o=r.styled.span`
  color: var(--privy-color-foreground);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.875rem; /* 166.667% */
  text-align: center;
`;e.s(["T",()=>o])},317842,e=>{"use strict";var r=e.i(997053);let o=r.styled.span`
  margin-top: 4px;
  color: var(--privy-color-foreground);
  text-align: center;

  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.375rem; /* 157.143% */

  && a {
    color: var(--privy-color-accent);
  }
`;e.s(["S",()=>o])},272313,e=>{"use strict";var r=e.i(997053);let o=r.css`
  && {
    border-width: 1px;
    padding: 0.5rem 1rem;
  }

  width: 100%;
  text-align: left;
  border: solid 1px var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-md);
  display: flex;
  justify-content: space-between;
  align-items: center;

  ${e=>"error"===e.$state?"\n        border-color: var(--privy-color-error);\n        background: var(--privy-color-error-bg);\n      ":""}
`,t=r.styled.div`
  ${o}
`;e.s(["B",()=>t,"a",()=>o])},267669,e=>{"use strict";var r=e.i(997053);let o=r.styled.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.125rem; /* 150% */
`;e.s(["L",()=>o])},703421,e=>{"use strict";var r=e.i(843476),o=e.i(823209),t=e.i(355982),i=e.i(271645),a=e.i(997053),n=e.i(355413),l=e.i(290382),s=e.i(267669),c=e.i(108313),d=e.i(272313);let u=(0,a.styled)(d.B)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,v=a.styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,p=a.styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,h=a.styled.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,g=(0,a.styled)(s.L)`
  text-align: left;
  margin-bottom: 0.5rem;
`,f=(0,a.styled)(l.E)`
  margin-top: 0.25rem;
`,y=(0,a.styled)(n.S)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`,m=({errMsg:e,balance:a,address:n,className:l,title:s,showCopyButton:d=!1})=>{let[m,b]=(0,i.useState)(!1);return(0,i.useEffect)(()=>{if(m){let e=setTimeout(()=>b(!1),3e3);return()=>clearTimeout(e)}},[m]),(0,r.jsxs)("div",{children:[s&&(0,r.jsx)(g,{children:s}),(0,r.jsx)(u,{className:l,$state:e?"error":void 0,children:(0,r.jsxs)(v,{children:[(0,r.jsxs)(p,{children:[(0,r.jsx)(c.A,{address:n,showCopyIcon:!1}),void 0!==a&&(0,r.jsx)(h,{children:a})]}),d&&(0,r.jsx)(y,{onClick:function(e){e.stopPropagation(),navigator.clipboard.writeText(n).then(()=>b(!0)).catch(console.error)},size:"sm",children:(0,r.jsxs)(r.Fragment,m?{children:["Copied",(0,r.jsx)(o.Check,{size:14})]}:{children:["Copy",(0,r.jsx)(t.Copy,{size:14})]})})]})}),e&&(0,r.jsx)(f,{children:e})]})};e.s(["W",()=>m])},640694,e=>{"use strict";let r=["CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C","CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW"],o=["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"],t={"solana:mainnet":{EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:{symbol:"USDC",decimals:6,address:"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"},Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB:{symbol:"USDT",decimals:6,address:"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"},So11111111111111111111111111111111111111112:{symbol:"SOL",decimals:9,address:"So11111111111111111111111111111111111111112"}},"solana:devnet":{"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU":{symbol:"USDC",decimals:6,address:"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"},EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS:{symbol:"USDT",decimals:6,address:"EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS"},So11111111111111111111111111111111111111112:{symbol:"SOL",decimals:9,address:"So11111111111111111111111111111111111111112"}},"solana:testnet":{}};function i(e,r){let o=parseFloat(e.toString())/1e9,t=a.format(r*o);return"$0.00"===t?"<$0.01":t}let a=new Intl.NumberFormat(void 0,{style:"currency",currency:"USD",maximumFractionDigits:2});e.s(["A",()=>"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL","D",()=>t,"J",()=>o,"L",()=>1e9,"R",()=>r,"S",()=>"11111111111111111111111111111111","T",()=>"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","a",()=>"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb","g",()=>i])},458383,e=>{"use strict";var r=e.i(640694);function o(e,r=6,t=!1,i=!1){let a=(parseFloat(e.toString())/1e9).toFixed(r).replace(/0+$/,"").replace(/\.$/,""),n=i?"":" SOL";return t?`${a}${n}`:`${"0"===a?"<0.001":a}${n}`}function t({amount:e,fee:t,tokenPrice:i,isUsdc:a}){let n=BigInt(Math.floor(parseFloat(e)*10**(a?6:9))),l=a?n:n+t;return{fundingAmountInBaseUnit:n,fundingAmountInUsd:i?(0,r.g)(n,i):void 0,totalPriceInUsd:i?(0,r.g)(l,i):void 0,totalPriceInNativeCurrency:o(l),feePriceInNativeCurrency:o(t),feePriceInUsd:i?(0,r.g)(t,i):void 0}}e.s(["a",()=>t,"g",()=>o])},290382,e=>{"use strict";var r=e.i(997053);let o=r.styled.span`
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.125rem; /* 150% */

  color: var(--privy-color-error);
`;e.s(["E",()=>o])},993556,e=>{"use strict";var r=e.i(271645);let o=r.forwardRef(function({title:e,titleId:o,...t},i){return r.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:i,"aria-labelledby":o},t),e?r.createElement("title",{id:o},e):null,r.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"}))});e.s(["default",0,o])},974935,e=>{"use strict";var r=e.i(271645);let o=r.forwardRef(function({title:e,titleId:o,...t},i){return r.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:i,"aria-labelledby":o},t),e?r.createElement("title",{id:o},e):null,r.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"}))});e.s(["default",0,o])},355413,e=>{"use strict";var r=e.i(843476),o=e.i(997053),t=e.i(345214),i=e.i(513153),a=e.i(993556),n=e.i(974935),l=e.i(271645);let s=l.forwardRef(function({title:e,titleId:r,...o},t){return l.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:t,"aria-labelledby":r},o),e?l.createElement("title",{id:r},e):null,l.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 18 18 6M6 6l12 12"}))});var c=e.i(515502);function d(e){return(0,r.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 460 40",...e,children:(0,r.jsx)("g",{fill:e.color||"var(--privy-color-foreground)",children:(0,r.jsx)("path",{d:"M0 15.4v15.38h4.64V19.96h3.58c2.47 0 3.63-.01 3.77-.02 1-.08 1.49-.15 2.18-.3a9.45 9.45 0 0 0 4.6-2.37c1.66-1.57 2.64-3.87 2.81-6.56.02-.3.02-1.19 0-1.49-.1-1.77-.56-3.35-1.36-4.72A8.84 8.84 0 0 0 15.14.57c-.93-.3-1.75-.43-3.09-.54C11.9.02 10.2 0 5.93 0H0ZM10.85 4c1.85.05 3.1.45 4.16 1.3.22.17.54.49.69.68a5.97 5.97 0 0 1 1.19 3.13c.04.35.04 1.36 0 1.71-.08.68-.23 1.3-.44 1.85a4.8 4.8 0 0 1-1.09 1.68A5.63 5.63 0 0 1 12 15.92c-.6.08-.4.08-4.01.09H4.64V3.98h2.9c1.6 0 3.08 0 3.31.02ZM187.65 5.71v5.72h-.27l-.09-.14a15.9 15.9 0 0 0-1.21-1.73c-.43-.5-1-.95-1.7-1.36-.54-.3-1.05-.5-1.73-.63a8.98 8.98 0 0 0-1.7-.17 8.84 8.84 0 0 0-7.8 4.03 12.95 12.95 0 0 0-2.03 6.39c-.07.98-.06 2.15.02 3.13.2 2.47.87 4.53 2.02 6.25a8.98 8.98 0 0 0 10.22 3.65 6.5 6.5 0 0 0 2.8-1.93c.41-.51.84-1.1 1.1-1.55l.1-.17h.37v3.58h4.38V0h-4.48Zm-5.24 5.54c1.3.14 2.3.6 3.17 1.48.9.9 1.5 2.09 1.85 3.64.36 1.6.39 3.72.06 5.43a8.13 8.13 0 0 1-1.54 3.62 5.1 5.1 0 0 1-3.93 1.96 6.13 6.13 0 0 1-2.32-.31 5.87 5.87 0 0 1-3.33-3.5c-.39-1-.62-2.05-.72-3.32-.03-.32-.04-1.35-.02-1.73.08-1.56.4-2.91.96-4.05a6.2 6.2 0 0 1 1.06-1.58 5.08 5.08 0 0 1 3.6-1.66c.25-.02.9 0 1.16.02ZM210.07 15.39l.01 15.38h4.38l.01-3.57h.37l.09.15c.24.44.84 1.26 1.21 1.7a6.79 6.79 0 0 0 2.57 1.75 9.3 9.3 0 0 0 6.86-.49 9.28 9.28 0 0 0 4.05-4.07A13.05 13.05 0 0 0 231 21.6c.21-1.73.18-3.7-.09-5.32a13.03 13.03 0 0 0-1.5-4.3 9.1 9.1 0 0 0-3.75-3.63 9.15 9.15 0 0 0-4.43-.96 7.46 7.46 0 0 0-2.8.5A7.07 7.07 0 0 0 216 9.7c-.4.52-.82 1.12-1.1 1.59l-.07.14h-.27V0h-4.5Zm11.13-4.14c1.07.1 1.94.44 2.7 1.04a6.1 6.1 0 0 1 1.64 1.98c.43.84.78 2 .94 3.11.15 1.16.16 2.4.02 3.54a9.34 9.34 0 0 1-1.39 4.03 5.33 5.33 0 0 1-2.69 2.15c-.9.3-2.04.38-3.06.2a5.14 5.14 0 0 1-3.45-2.37 6.03 6.03 0 0 1-.45-.8c-.5-1.03-.8-2.2-.92-3.58-.04-.49-.06-.89-.05-1.53.01-.76.05-1.23.13-1.85.38-2.53 1.47-4.38 3.15-5.31a5.46 5.46 0 0 1 2.3-.63 10 10 0 0 1 1.13.02ZM69.05 2.17l-.01 2.77V7.7h-3.36v3.6h3.36v6.8l.01 7.15c.06 1.4.4 2.44 1.1 3.37a5.8 5.8 0 0 0 2.97 2.07c.91.3 1.83.42 2.9.38a8.71 8.71 0 0 0 2.66-.48l-.8-3.7-.38.06a4.96 4.96 0 0 1-2.43-.06c-.33-.1-.56-.25-.8-.49-.4-.41-.6-.88-.7-1.67-.02-.2-.02-.62-.03-6.82v-6.6h4.73V7.7h-4.73V2.16h-4.49ZM133.34 2.17V7.7h-3.39v3.6h3.38v6.9l.01 7.17a5.66 5.66 0 0 0 2.36 4.49c.85.6 2.03 1.03 3.26 1.17.85.1 2.03.05 2.81-.1.3-.06.75-.18 1-.26l.2-.06v-.05l-.81-3.67-.37.06a4.99 4.99 0 0 1-1.8.09c-.85-.13-1.32-.4-1.7-.97a2.63 2.63 0 0 1-.39-1.04c-.06-.4-.06 0-.06-7.1V11.3h4.7V7.7h-4.7l-.01-2.77V2.16h-4.49ZM293.41 2.36a14.56 14.56 0 0 0-13.7 16.07 14.59 14.59 0 0 0 21.86 11.08 14.5 14.5 0 0 0 7.11-14.07 14.61 14.61 0 0 0-6.53-10.73 14.49 14.49 0 0 0-8.74-2.35ZM350.8 2.36a10.17 10.17 0 0 0-7.56 4.2c-.16.2-.45.63-.58.83l-.05.1h-.47l-.01-4.36h-7.36v36.4h7.82V27.27h.49l.05.07a11.3 11.3 0 0 0 7.49 4.15 10.52 10.52 0 0 0 9.38-4.1c1.66-2.1 2.73-4.9 3.07-8.06.1-.87.13-1.4.13-2.37 0-.8 0-1.1-.07-1.76a15.95 15.95 0 0 0-3.23-8.72 12.8 12.8 0 0 0-1.85-1.84 10.49 10.49 0 0 0-7.26-2.28Zm-.94 6.05c1.27.15 2.33.65 3.2 1.5.98.96 1.67 2.31 2.03 4 .34 1.57.38 3.68.12 5.39a9.78 9.78 0 0 1-1.04 3.25c-.14.25-.44.69-.6.89a5.35 5.35 0 0 1-4.31 2.07 5.25 5.25 0 0 1-4.41-1.9 7.35 7.35 0 0 1-1.26-2.32 14.09 14.09 0 0 1-.62-4.83c.05-1.98.38-3.53 1.02-4.85a5.63 5.63 0 0 1 2.5-2.65c.66-.34 1.3-.5 2.14-.58.18-.02 1.04 0 1.23.03ZM363.63 3.1l-.01 3.2v3.16h1.43c1.26.01 1.44.02 1.54.04.42.09.66.28.79.62.08.23.08.08.08 2.96a911.57 911.57 0 0 1 .03 10.18v7.54h7.82v-7.4l.01-7.83c.03-.94.11-1.63.27-2.28.46-1.9 1.54-2.93 3.35-3.23.52-.08.2-.08 5-.08h4.4V3.08h-3.1c-3.48 0-3.91.01-4.67.1-1.83.2-3.04.79-3.96 1.88-.5.6-.9 1.32-1.26 2.26l-.06.17h-.46V3.09h-5.6c-4.46 0-5.6 0-5.6.02ZM390.8 16.95V30.8h3.87l3.86-.01V3.09h-7.73ZM400.6 3.1l-.01.4v.38l4.66 13.4 4.69 13.47.02.05h10.3l.03-.05 4.67-13.45 4.67-13.4V3.1h-7.43l-6.7 19.26h-.5l-3.28-9.5-3.31-9.64-.05-.12h-3.88l-3.88.01ZM430.98 3.1c-.01 0-.02.19-.02.4v.39l5.08 14.59c2.8 8.02 5.08 14.6 5.08 14.61.01.02-.22.02-4.8.02h-4.82v6.42h4.95c5.09 0 5.23 0 5.87-.06 3.15-.28 5.29-1.63 6.63-4.15.28-.55.44-.95.87-2.16L459 6.78l1-2.89v-.8h-7.43l-6.69 19.26h-.5l-3.27-9.46-3.31-9.64-.06-.16h-3.88l-3.88.01ZM36.57 7.36c-1.36.1-2.6.6-3.62 1.45a5.65 5.65 0 0 0-1.67 2.42l-.05.13H31V7.7h-4.35v23.08h4.5v-7.3c0-8 0-7.34.08-7.82a4.89 4.89 0 0 1 2.06-3.18c.83-.58 1.74-.89 2.87-.98a11.87 11.87 0 0 1 2.8.25H39v-4.3l-.21-.02c-.61-.07-1.74-.1-2.22-.07ZM51.08 7.41c-2.33.12-4.3.84-5.95 2.16a9.89 9.89 0 0 0-2.03 2.2 12.5 12.5 0 0 0-2 5.78 18.04 18.04 0 0 0 0 3.65 12.13 12.13 0 0 0 2.26 6.05 9.74 9.74 0 0 0 5 3.52c2.11.64 4.7.64 6.8 0a9.78 9.78 0 0 0 4.88-3.37c1.38-1.78 2.19-4 2.4-6.58.13-1.46.06-3.06-.18-4.42a11.24 11.24 0 0 0-3.58-6.6 10 10 0 0 0-5.75-2.35c-.56-.06-1.31-.07-1.85-.04Zm1.42 3.78c.88.1 1.62.34 2.28.75a6.13 6.13 0 0 1 1.99 2.15 10.31 10.31 0 0 1 1.2 5c.02 1.23-.12 2.44-.42 3.51a7.14 7.14 0 0 1-1.81 3.32c-.61.6-1.2.98-1.95 1.24a6 6 0 0 1-2 .3 5.7 5.7 0 0 1-2.72-.6 5 5 0 0 1-1.28-.94A7.1 7.1 0 0 1 46 22.73c-.57-1.99-.6-4.46-.08-6.5a7.24 7.24 0 0 1 2.03-3.67 5.13 5.13 0 0 1 3.35-1.4 11 11 0 0 1 1.2.03ZM92.05 7.4c-.96.06-1.56.15-2.3.33a9.62 9.62 0 0 0-6.09 4.66 13.5 13.5 0 0 0-1.71 7c0 .83 0 1.04.06 1.6.16 1.77.58 3.32 1.29 4.7A9.72 9.72 0 0 0 90.28 31c1.84.37 4.08.32 5.85-.13a9.07 9.07 0 0 0 5.02-3.1A7.64 7.64 0 0 0 102.5 25l-2.11-.39-2.11-.38-.08.13a4.72 4.72 0 0 1-2.35 2.55 6.3 6.3 0 0 1-2.23.58c-.29.03-1.13.03-1.44 0a6.35 6.35 0 0 1-3.02-1.04 5.93 5.93 0 0 1-2.02-2.43 8.44 8.44 0 0 1-.72-3.18v-.26h16.38v-.81c0-1.83-.06-2.76-.25-3.87-.2-1.22-.53-2.24-1.05-3.28a8.9 8.9 0 0 0-2.66-3.26 10.1 10.1 0 0 0-5.34-1.94 18.3 18.3 0 0 0-1.46-.03Zm1.3 3.75c1.2.13 2.19.55 3.05 1.3a5.8 5.8 0 0 1 1.78 2.96c.13.51.21 1.17.21 1.66v.15H86.43v-.12c.08-.97.3-1.78.72-2.61.5-1 1.2-1.8 2.14-2.42a5.32 5.32 0 0 1 2.9-.95c.2-.01.97 0 1.17.03ZM116.79 7.41c-2 .1-3.73.65-5.22 1.65a10.7 10.7 0 0 0-4.25 6.06 16.1 16.1 0 0 0-.5 5.8c.2 2.17.84 4.13 1.88 5.76.58.9 1.32 1.73 2.15 2.4a9.37 9.37 0 0 0 3.6 1.8 12.06 12.06 0 0 0 3.92.34 10.2 10.2 0 0 0 3.84-.95 8.31 8.31 0 0 0 4.76-6.75l.01-.04h-4.37l-.05.16a4.87 4.87 0 0 1-4.24 3.75c-.59.07-1.32.06-1.93-.05a5.47 5.47 0 0 1-3.5-2.27c-.56-.75-1-1.73-1.26-2.79a13.8 13.8 0 0 1-.16-5.24 7.77 7.77 0 0 1 2.1-4.3 5.48 5.48 0 0 1 2.15-1.3 6.4 6.4 0 0 1 3.89.1c.59.21 1.03.5 1.5.96a5.32 5.32 0 0 1 1.46 2.5l.04.15h4.37v-.06a8.22 8.22 0 0 0-5.31-6.94 10.98 10.98 0 0 0-4.88-.74ZM156.2 7.41a9.87 9.87 0 0 0-6 2.29 11.02 11.02 0 0 0-3.41 5.43c-.52 1.78-.68 3.9-.48 5.97.17 1.8.63 3.38 1.37 4.8a9.68 9.68 0 0 0 5.91 4.86c1.65.48 3.63.61 5.53.36 3.72-.49 6.55-2.62 7.56-5.69.12-.39.13-.42.1-.43-.02 0-4.13-.75-4.19-.75-.03 0-.04 0-.1.16-.18.42-.45.9-.72 1.22-.16.2-.49.53-.7.7-.67.54-1.5.9-2.43 1.08-.48.08-.83.11-1.41.11-.64 0-1.07-.04-1.6-.15a5.76 5.76 0 0 1-3.93-2.83 8 8 0 0 1-.99-3.79v-.16h16.38v-1.11l-.02-1.43c-.1-2.25-.53-4-1.35-5.59a9.24 9.24 0 0 0-6.18-4.75c-1.04-.26-2.2-.36-3.33-.3Zm1.45 3.74a5.35 5.35 0 0 1 3.66 1.94 6.1 6.1 0 0 1 1.38 4.01v.12h-11.97v-.06c0-.02 0-.14.02-.25a6.6 6.6 0 0 1 2.15-4.32 5.73 5.73 0 0 1 3.5-1.46c.25-.02 1 0 1.26.02ZM233.58 7.82l8.37 23.22a49.22 49.22 0 0 1-.67 1.9 5.36 5.36 0 0 1-1.14 1.8c-.41.4-.82.58-1.48.69-.27.04-1.03.03-1.35 0a8.05 8.05 0 0 1-1.1-.23l-1.08 3.67c0 .02.32.14.66.22.83.21 1.57.29 2.56.28.56-.01.8-.03 1.24-.1 2.71-.4 4.66-2.09 5.86-5.08l9.64-26.44c0-.02-4.82-.06-4.83-.05l-2.93 8.96-2.91 8.94h-.24l-.22-.65-2.91-8.95-2.7-8.3H233.53ZM293.05 35.8c-1.18.04-1.93.09-2.8.16-2.52.24-4.53.69-5.43 1.23-.7.41-.76.86-.2 1.28.88.66 3.29 1.19 6.36 1.4a48.55 48.55 0 0 0 5.75.05c3.47-.19 6.24-.78 7.11-1.5.22-.19.3-.34.3-.53 0-.1 0-.12-.04-.22-.35-.69-2.32-1.3-5.25-1.63a41.09 41.09 0 0 0-5.8-.24Zm0 0"})})})}let u=o.styled.span`
  margin-top: 16px;
  font-size: 13px;
  text-align: center;
  color: var(--privy-color-foreground-3);
  display: block;

  && > a {
    color: var(--privy-color-accent);
  }
`;function v({app:{legal:{privacyPolicyUrl:e,termsAndConditionsUrl:o,requireUsersAcceptTerms:t}},alwaysShowImplicitConsent:i}){let a=!(!e||!o);return(!t||i)&&(o||e)?(0,r.jsxs)(u,{children:["By logging in I agree to the"," ",o&&(0,r.jsx)("a",{href:o,target:"_blank",children:a?"Terms":"Terms of Service"}),a&&" & ",e&&(0,r.jsx)("a",{href:e,target:"_blank",children:"Privacy Policy"})]}):(0,r.jsx)(u,{})}let p=({className:e})=>{let{appearance:o}=(0,t.u)();return(0,r.jsx)(g,{className:e,children:o.footerLogo??(0,r.jsx)(h,{href:"https://www.privy.io/",target:"_blank",id:"protected-by-privy",children:(0,r.jsx)(d,{color:"currentColor",height:13,width:150})})})},h=o.styled.a`
  && {
    padding: 0;
    color: var(--privy-color-foreground-3);
  }
`,g=o.styled.div`
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
`,f=({variant:e="primary",size:o="lg",children:t,success:i,...a})=>{switch(e){case"secondary":return(0,r.jsx)(w,{size:o,...a,children:t});case"error":return(0,r.jsx)(w,{$warn:!0,size:o,...a,children:t});case"muted":return(0,r.jsx)(j,{size:o,...a,children:t});default:return(0,r.jsx)(m,{size:o,success:i,...a,children:t})}},y=o.styled.button`
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
`,m=({children:e,loading:o,disabled:t,success:a,size:n="lg",loadingText:l="Loading...",as:s,onClick:c,...d})=>{let u="a"===s,v=!(!o&&!t);return(0,r.jsx)(k,{as:s,disabled:u?void 0:v,"aria-disabled":u?v:void 0,$success:a,$size:n,onClick:e=>{u&&v?e.preventDefault():c?.(e)},...d,children:o?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(i.G,{}),l?(0,r.jsx)("span",{style:{marginLeft:"8px"},children:l}):null]}):e})},b=({children:e,loading:o,disabled:t,...a})=>(0,r.jsx)(x,{disabled:t,...a,children:o?(0,r.jsx)(i.G,{color:"var(--privy-color-foreground-accent)"}):e}),x=(0,o.styled)(y)`
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
`,k=(0,o.styled)(y)`
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
  ${e=>e.disabled&&o.css`
      &&&,
      &&&:hover,
      &&&:active {
        background-color: var(--privy-color-background-2);
        border: 1px solid var(--privy-color-border-default);
        color: var(--privy-color-foreground-disabled);
        cursor: not-allowed;
      }
    `}
`,w=({children:e,loading:o,disabled:t,size:a="lg",loadingText:n="Loading...",as:l,onClick:s,...c})=>{let d="a"===l,u=!(!o&&!t);return(0,r.jsx)(C,{as:l,disabled:d?void 0:u,"aria-disabled":d?u:void 0,$size:a,onClick:e=>{d&&u?e.preventDefault():s?.(e)},...c,children:o?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(i.G,{}),n?(0,r.jsx)("span",{style:{marginLeft:"8px"},children:n}):null]}):e})},j=({children:e,loading:o,disabled:t,size:a="lg",loadingText:n="Loading...",as:l,onClick:s,...c})=>{let d="a"===l,u=!(!o&&!t);return(0,r.jsx)(S,{as:l,disabled:d?void 0:u,"aria-disabled":d?u:void 0,$size:a,onClick:e=>{d&&u?e.preventDefault():s?.(e)},...c,children:o?(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(i.G,{}),n?(0,r.jsx)("span",{style:{marginLeft:"8px"},children:n}):null]}):e})},C=(0,o.styled)(y)`
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
  ${e=>e.disabled&&o.css`
      &&&,
      &&&:hover,
      &&&:active {
        border-color: var(--privy-color-border-default);
        background-color: var(--privy-color-background-2);
        color: var(--privy-color-foreground-disabled);
        cursor: not-allowed;
      }
    `}
`,S=(0,o.styled)(y)`
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
  ${e=>e.disabled&&o.css`
      &&&,
      &&&:hover,
      &&&:active {
        border-color: var(--privy-color-border-default);
        background-color: var(--privy-color-background-2);
        color: var(--privy-color-foreground-disabled);
        cursor: not-allowed;
      }
    `}
`,$=o.styled.button`
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

    ${e=>e.invisible&&o.css`
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
`;o.styled.div`
  /* Set to match height of SoftCtaButton to avoid reflow if conditionally rendered */
  height: 44px;
`;let M=({children:e,onClick:o,disabled:t,isSubmitting:a,...n})=>(0,r.jsxs)(T,{$isSubmitting:a,onClick:o,disabled:t,...n,children:[(0,r.jsx)("span",{children:e}),(0,r.jsx)("span",{children:(0,r.jsx)(i.G,{})})]}),T=o.styled.button`
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
`,A=({backFn:e})=>(0,r.jsx)("div",{children:(0,r.jsx)(D,{onClick:e,children:(0,r.jsx)(a.default,{height:"16px",width:"16px",strokeWidth:2})})}),z=({infoFn:e})=>(0,r.jsx)("div",{children:(0,r.jsx)(Z,{"aria-label":"info",onClick:e,children:(0,r.jsx)(n.default,{height:"22px",width:"22px",strokeWidth:2})})}),F=e=>(0,r.jsx)("div",{children:(0,r.jsx)(D,{"aria-label":"close modal",onClick:e.onClose,children:(0,r.jsx)(s,{height:"16px",width:"16px",strokeWidth:2})})}),E=({backFn:e,infoFn:o,onClose:i,title:a,closeable:n=!0,className:l})=>{let{closePrivyModal:s}=(0,c.u)(),d=(0,t.u)();return(0,r.jsxs)(P,{className:l,children:[(0,r.jsxs)(B,{children:[e&&(0,r.jsx)(A,{backFn:e}),(0,r.jsx)("div",{style:{height:24}}),o&&(0,r.jsx)(z,{infoFn:o})]}),a&&(0,r.jsx)(U,{id:"privy-dialog-title",children:a}),(0,r.jsx)(L,{children:!d.render.standalone&&n&&(0,r.jsx)(F,{onClose:i||(()=>s())})})]})},D=o.styled.button`
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
`,Z=(0,o.styled)(D)`
  && {
    background-color: transparent;
  }
`,P=o.styled.div`
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
`,B=o.styled.div`
  flex: 1;
  align-items: center;
  display: flex;
  gap: 8px;
`,L=o.styled.div`
  flex: 1;
  display: flex;
  justify-content: flex-end;
`,U=o.styled.div`
  overflow: hidden;
  white-space: nowrap;
  max-width: 100%;
  text-overflow: ellipsis;
  text-align: center;
  color: var(--privy-color-foreground-2);
`;e.s(["B",()=>p,"E",()=>M,"M",()=>E,"P",()=>m,"S",()=>w,"T",()=>v,"a",()=>f,"b",()=>g,"c",()=>b,"d",()=>$],355413)},773524,e=>{"use strict";var r=e.i(271645);let o=e=>{let r=e.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,r,o)=>o?o.toUpperCase():r.toLowerCase());return r.charAt(0).toUpperCase()+r.slice(1)},t=(...e)=>e.filter((e,r,o)=>!!e&&""!==e.trim()&&o.indexOf(e)===r).join(" ").trim();var i={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};let a=(0,r.forwardRef)(({color:e="currentColor",size:o=24,strokeWidth:a=2,absoluteStrokeWidth:n,className:l="",children:s,iconNode:c,...d},u)=>(0,r.createElement)("svg",{ref:u,...i,width:o,height:o,stroke:e,strokeWidth:n?24*Number(a)/Number(o):a,className:t("lucide",l),...!s&&!(e=>{for(let r in e)if(r.startsWith("aria-")||"role"===r||"title"===r)return!0})(d)&&{"aria-hidden":"true"},...d},[...c.map(([e,o])=>(0,r.createElement)(e,o)),...Array.isArray(s)?s:[s]])),n=(e,i)=>{let n=(0,r.forwardRef)(({className:n,...l},s)=>(0,r.createElement)(a,{ref:s,iconNode:i,className:t(`lucide-${o(e).replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase()}`,`lucide-${e}`,n),...l}));return n.displayName=o(e),n};e.s(["default",()=>n],773524)},823209,e=>{"use strict";let r=(0,e.i(773524).default)("check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);e.s(["Check",()=>r],823209)},355982,e=>{"use strict";let r=(0,e.i(773524).default)("copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);e.s(["Copy",()=>r],355982)},108313,e=>{"use strict";var r=e.i(843476),o=e.i(823209),t=e.i(355982),i=e.i(271645),a=e.i(997053),n=e.i(513153),l=e.i(355413);let s=({address:e,showCopyIcon:a,url:s,className:v})=>{let[p,h]=(0,i.useState)(!1);function g(r){r.stopPropagation(),navigator.clipboard.writeText(e).then(()=>h(!0)).catch(console.error)}return(0,i.useEffect)(()=>{if(p){let e=setTimeout(()=>h(!1),3e3);return()=>clearTimeout(e)}},[p]),(0,r.jsxs)(c,s?{children:[(0,r.jsx)(u,{title:e,className:v,href:`${s}/address/${e}`,target:"_blank",children:(0,n.D)(e)}),a&&(0,r.jsx)(l.S,{onClick:g,size:"sm",style:{gap:"0.375rem"},children:(0,r.jsxs)(r.Fragment,p?{children:["Copied",(0,r.jsx)(o.Check,{size:16})]}:{children:["Copy",(0,r.jsx)(t.Copy,{size:16})]})})]}:{children:[(0,r.jsx)(d,{title:e,className:v,children:(0,n.D)(e)}),a&&(0,r.jsx)(l.S,{onClick:g,size:"sm",style:{gap:"0.375rem",fontSize:"14px"},children:(0,r.jsxs)(r.Fragment,p?{children:["Copied",(0,r.jsx)(o.Check,{size:14})]}:{children:["Copy",(0,r.jsx)(t.Copy,{size:14})]})})]})},c=a.styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,d=a.styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,u=a.styled.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;e.s(["A",()=>s])},825158,e=>{"use strict";var r=e.i(285973),o=e.i(644616);function t(e){return e?`${e.slice(0,5)}…${e.slice(-4)}`:""}function i({wei:e,precision:o=3}){return parseFloat((0,r.formatEther)(e)).toFixed(o).replace(/0+$/,"").replace(/\.$/,"")}function a({amount:e,decimals:r}){return(0,o.formatUnits)(BigInt(e),r)}e.s(["formatTokenAmount",()=>a,"formatWalletAddress",()=>t,"formatWeiAmount",()=>i])},377799,e=>{"use strict";e.s(["O",()=>"sdk_fiat_on_ramp_completed_with_status"])},629518,e=>{"use strict";var r=e.i(843476),o=e.i(336040),t=e.i(355413);function i({title:e}){let{currentScreen:i,navigateBack:a,navigate:n,data:l,setModalData:s}=(0,o.a)();return(0,r.jsx)(t.M,{title:e,backFn:"ManualTransferScreen"===i?a:i===l?.funding?.methodScreen?l.funding.comingFromSendTransactionScreen?()=>n("SendTransactionScreen"):void 0:l?.funding?.methodScreen?()=>{let e=l.funding;e.usingDefaultFundingMethod&&(e.usingDefaultFundingMethod=!1),s({funding:e,solanaFundingData:l?.solanaFundingData}),n(e.methodScreen)}:void 0})}e.s(["t",()=>i])},223606,e=>{"use strict";function r(e){switch(e){case"solana:mainnet":return"Solana";case"solana:devnet":return"Devnet";case"solana:testnet":return"Testnet"}}e.s(["g",()=>r])},802970,e=>{"use strict";var r=e.i(309682),o=e.i(110163),t=e.i(85478);let i=async({chain:e,address:i,appId:n,rpcConfig:l,erc20Address:s})=>{let c=(0,r.createPublicClient)({chain:e,transport:(0,o.http)((0,t.a)(e,l,n))});return{balance:await c.readContract({address:s,abi:a,functionName:"balanceOf",args:[i]}).catch(()=>0n),chain:e}},a=[{constant:!0,inputs:[{name:"_owner",type:"address"}],name:"balanceOf",outputs:[{name:"balance",type:"uint256"}],payable:!1,stateMutability:"view",type:"function"}];e.s(["g",()=>i])},681964,e=>{"use strict";var r=e.i(640694);function o(e){let[o]=Object.entries(r.D[e]).find(([e,r])=>"USDC"===r.symbol)??[];return o}e.s(["g",()=>o])},786706,e=>{"use strict";var r=e.i(271645),o=e.i(309682),t=e.i(110163),i=e.i(85478),a=e.i(515502);function n({rpcConfig:e,appId:n,address:l,chain:s}){let{chains:c}=(0,a.u)(),[d,u]=(0,r.useState)(0n),[v,p]=(0,r.useState)(!1),h=(0,r.useMemo)(()=>{let r=s||c[0];if(r)return(0,o.createPublicClient)({chain:s,transport:(0,t.http)((0,i.a)(r,e,n))})},[s,e,n]),g=(0,r.useCallback)(async()=>{if(!l||!h)return;p(!0);let e=await h.getBalance({address:l}).catch(console.error);return e?(u(e),p(!1),e):void 0},[h,l,u]);return(0,r.useEffect)(()=>{g().catch(console.error)},[]),{balance:d,isLoading:v,reloadBalance:g}}e.s(["u",()=>n])},267676,e=>{"use strict";var r=e.i(843476),o=e.i(271645);let t=o.forwardRef(function({title:e,titleId:r,...t},i){return o.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:i,"aria-labelledby":r},t),e?o.createElement("title",{id:r},e):null,o.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"}))});var i=e.i(997053);let a=({children:e,theme:o})=>(0,r.jsxs)(n,{$theme:o,children:[(0,r.jsx)(t,{width:"20px",height:"20px",color:"var(--privy-color-icon-subtle)",strokeWidth:2,style:{flexShrink:0}}),(0,r.jsx)(l,{$theme:o,children:e})]}),n=i.styled.div`
  display: flex;
  gap: 0.75rem;
  background-color: var(--privy-color-background-2);
  align-items: flex-start;
  padding: 1rem;
  border-radius: 0.75rem;
`,l=i.styled.div`
  color: ${e=>"dark"===e.$theme?"var(--privy-color-foreground-2)":"var(--privy-color-foreground)"};
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  flex: 1;
  text-align: left;
`;e.s(["I",()=>a],267676)},706321,e=>{"use strict";var r=e.i(843476),o=e.i(271645),t=e.i(644616),i=e.i(825158),a=e.i(355413),n=e.i(938921),l=e.i(472553),s=e.i(629518),c=e.i(267676),d=e.i(317842),u=e.i(456842),v=e.i(703421),p=e.i(345214),h=e.i(513153),g=e.i(515502),f=e.i(336040),y=e.i(786706),m=e.i(29483),b=e.i(377799),x=e.i(101183),k=e.i(223606),w=e.i(681964),j=e.i(458383),C=e.i(802970);e.i(973134),e.i(123287),e.i(33750),e.i(595932),e.i(117595),e.i(610760);let S={component:()=>{let{wallets:e}=(0,m.u)(),{connectors:S}=(0,g.u)(),M=S.filter(h.v).flatMap(e=>e.wallets),{data:T,setModalData:A,navigate:z,lastScreen:F}=(0,f.a)(),{rpcConfig:E,appId:D,createAnalyticsEvent:Z,closePrivyModal:P}=(0,g.u)(),B=(0,p.u)(),[L,U]=(0,o.useState)(void 0),[N,V]=(0,o.useState)(!1),I=T?.funding,{reloadBalance:_}=(0,y.u)({rpcConfig:E,appId:D,address:"ethereum"===I.chainType?I.address:void 0,chain:"ethereum"===I.chainType?I.chain:void 0}),W="solana"===I.chainType,O=W?I.isUSDC?"USDC":"SOL":I.erc20Address?I.erc20ContractInfo?.symbol:I.chain.nativeCurrency.symbol,H=W?M.find(({address:e})=>e===I.address):e.find(({address:e})=>(0,h.D)(e)===(0,h.D)(I.address));if(!I)return A({errorModalData:{error:Error("Couldn't find funding config"),previousScreen:F||"FundingMethodSelectionScreen"},funding:T?.funding,solanaFundingData:T?.solanaFundingData,sendTransaction:T?.sendTransaction}),z("ErrorScreen"),(0,r.jsx)(r.Fragment,{});(0,o.useEffect)(()=>{let e=W?async function(){if("solana"!==I.chainType)return;let e=B.solanaRpcs[I.chain];e?(I.isUSDC?async function({rpc:e,address:r,mintAddress:o}){let t=await e.getTokenAccountsByOwner(r,{mint:o},{encoding:"jsonParsed",commitment:"confirmed"}).send(),i=t.value[0]?.account;return i?BigInt(i.data.parsed.info.tokenAmount.amount):0n}({rpc:e.rpc,address:I.address,mintAddress:(0,w.g)(I.chain)}):(0,x.w)({rpc:e.rpc,address:I.address})).then(e=>{let r=BigInt(e);L&&r>L&&(V(!0),Z({eventName:b.O,payload:{provider:"manual",status:"success",chainType:"solana",address:H?.address,value:I.isUSDC?(0,t.formatUnits)(r-L,6):(0,t.formatUnits)(r-L,9),token:I.isUSDC?"USDC":"SOL"}})),U(r)}):console.warn("Unable to load solana rpc, skipping balance")}:async function(){"ethereum"===I.chainType&&(async()=>{if(!I.erc20Address)return await _()??BigInt(0);{let{balance:e}=await (0,C.g)({chain:I.chain,address:I.address,erc20Address:I.erc20Address,rpcConfig:E,appId:D});return e}})().then(e=>{L&&e>L&&(V(!0),Z({eventName:b.O,payload:{provider:"manual",status:"success",chainType:"ethereum",address:H?.address,chainId:I.chain.id,value:(0,t.formatUnits)(e-L,I.erc20ContractInfo?.decimals??18),token:I.erc20ContractInfo?.symbol??I.erc20Address??"ETH"}})),U(e)}).catch(()=>U(void 0))},r=setInterval(e,2e3);return e(),()=>clearInterval(r)},[L]);let R=(0,o.useMemo)(()=>null==L?"":I.isUSDC?(0,i.formatTokenAmount)({amount:L,decimals:6}):W?(0,j.g)(L,3,!0,!0):null!=I.erc20ContractInfo?.decimals?(0,i.formatTokenAmount)({amount:L,decimals:I.erc20ContractInfo.decimals}):(0,i.formatWeiAmount)({wei:L}),[L,W,I]),q="ethereum"===I.chainType?I.chain.name:(0,k.g)(I.chain),G=(0,o.useMemo)(()=>""===I.uiConfig?.receiveFundsTitle?null:(0,r.jsx)(u.T,{children:I.uiConfig?.receiveFundsTitle??`Receive ${I.amount} ${O??""}`.trim()}),[I.uiConfig?.receiveFundsTitle,I.amount,O]),J=(0,o.useMemo)(()=>""===I.uiConfig?.receiveFundsSubtitle?null:(0,r.jsx)(d.S,{children:I.uiConfig?.receiveFundsSubtitle??`Scan this code or copy your wallet address to receive funds on ${q}.`}),[I.uiConfig?.receiveFundsSubtitle,q]),Q="solana"===I.chainType&&I.isUSDC&&(0,w.g)(I.chain)?`?spl-token=${(0,w.g)(I.chain)}`:"";return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(s.t,{}),G,J,(0,r.jsxs)(n.F,{style:{gap:"1rem",margin:G||J?"1rem 0":"0"},children:[(0,r.jsx)(l.Q,{url:`${I.chainType}:${I.address}${Q}`,size:200,squareLogoElement:$}),(0,r.jsxs)(c.I,{theme:B.appearance.palette.colorScheme,children:["Make sure to send funds on ",q,"."]}),(0,r.jsx)(v.W,{title:"Your wallet",errMsg:void 0,showCopyButton:!0,balance:`${R} ${O}`,address:I.address}),N&&(0,r.jsx)(a.P,{onClick:()=>P({shouldCallAuthOnSuccess:!1,isSuccess:!0}),children:"Continue"})]}),(0,r.jsx)(a.B,{})]})}},$=({...e})=>(0,r.jsx)(x.y,{color:"black",...e});e.s(["ManualTransferScreen",()=>S,"default",()=>S])}]);