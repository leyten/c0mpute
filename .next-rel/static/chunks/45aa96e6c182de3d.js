(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,703421,e=>{"use strict";var r=e.i(843476),s=e.i(823209),n=e.i(355982),i=e.i(271645),t=e.i(997053),o=e.i(355413),l=e.i(290382),a=e.i(267669),d=e.i(108313),c=e.i(272313);let h=(0,t.styled)(c.B)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,x=t.styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,j=t.styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,u=t.styled.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,m=(0,t.styled)(a.L)`
  text-align: left;
  margin-bottom: 0.5rem;
`,p=(0,t.styled)(l.E)`
  margin-top: 0.25rem;
`,g=(0,t.styled)(o.S)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`,f=({errMsg:e,balance:t,address:o,className:l,title:a,showCopyButton:c=!1})=>{let[f,y]=(0,i.useState)(!1);return(0,i.useEffect)(()=>{if(f){let e=setTimeout(()=>y(!1),3e3);return()=>clearTimeout(e)}},[f]),(0,r.jsxs)("div",{children:[a&&(0,r.jsx)(m,{children:a}),(0,r.jsx)(h,{className:l,$state:e?"error":void 0,children:(0,r.jsxs)(x,{children:[(0,r.jsxs)(j,{children:[(0,r.jsx)(d.A,{address:o,showCopyIcon:!1}),void 0!==t&&(0,r.jsx)(u,{children:t})]}),c&&(0,r.jsx)(g,{onClick:function(e){e.stopPropagation(),navigator.clipboard.writeText(o).then(()=>y(!0)).catch(console.error)},size:"sm",children:(0,r.jsxs)(r.Fragment,f?{children:["Copied",(0,r.jsx)(s.Check,{size:14})]}:{children:["Copy",(0,r.jsx)(n.Copy,{size:14})]})})]})}),e&&(0,r.jsx)(p,{children:e})]})};e.s(["W",()=>f])},272313,e=>{"use strict";var r=e.i(997053);let s=r.css`
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
`,n=r.styled.div`
  ${s}
`;e.s(["B",()=>n,"a",()=>s])},267669,e=>{"use strict";var r=e.i(997053);let s=r.styled.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.125rem; /* 150% */
`;e.s(["L",()=>s])},290382,e=>{"use strict";var r=e.i(997053);let s=r.styled.span`
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.125rem; /* 150% */

  color: var(--privy-color-error);
`;e.s(["E",()=>s])},823209,e=>{"use strict";let r=(0,e.i(773524).default)("check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);e.s(["Check",()=>r],823209)},355982,e=>{"use strict";let r=(0,e.i(773524).default)("copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);e.s(["Copy",()=>r],355982)},108313,e=>{"use strict";var r=e.i(843476),s=e.i(823209),n=e.i(355982),i=e.i(271645),t=e.i(997053),o=e.i(513153),l=e.i(355413);let a=({address:e,showCopyIcon:t,url:a,className:x})=>{let[j,u]=(0,i.useState)(!1);function m(r){r.stopPropagation(),navigator.clipboard.writeText(e).then(()=>u(!0)).catch(console.error)}return(0,i.useEffect)(()=>{if(j){let e=setTimeout(()=>u(!1),3e3);return()=>clearTimeout(e)}},[j]),(0,r.jsxs)(d,a?{children:[(0,r.jsx)(h,{title:e,className:x,href:`${a}/address/${e}`,target:"_blank",children:(0,o.D)(e)}),t&&(0,r.jsx)(l.S,{onClick:m,size:"sm",style:{gap:"0.375rem"},children:(0,r.jsxs)(r.Fragment,j?{children:["Copied",(0,r.jsx)(s.Check,{size:16})]}:{children:["Copy",(0,r.jsx)(n.Copy,{size:16})]})})]}:{children:[(0,r.jsx)(c,{title:e,className:x,children:(0,o.D)(e)}),t&&(0,r.jsx)(l.S,{onClick:m,size:"sm",style:{gap:"0.375rem",fontSize:"14px"},children:(0,r.jsxs)(r.Fragment,j?{children:["Copied",(0,r.jsx)(s.Check,{size:14})]}:{children:["Copy",(0,r.jsx)(n.Copy,{size:14})]})})]})},d=t.styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,c=t.styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,h=t.styled.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;e.s(["A",()=>a])},601972,e=>{"use strict";var r=e.i(843476),s=e.i(530448),n=e.i(997053);let i=({children:e,theme:n})=>(0,r.jsxs)(t,{$theme:n,children:[(0,r.jsx)(s.default,{width:"20px",height:"20px",color:"var(--privy-color-icon-warning)",strokeWidth:2,style:{flexShrink:0}}),(0,r.jsx)(o,{$theme:n,children:e})]}),t=n.styled.div`
  display: flex;
  gap: 0.75rem;
  background-color: var(--privy-color-warn-bg);
  align-items: flex-start;
  padding: 1rem;
  border-radius: 0.75rem;
`,o=n.styled.div`
  color: ${e=>"dark"===e.$theme?"var(--privy-color-foreground-2)":"var(--privy-color-foreground)"};
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  flex: 1;
  text-align: left;
`;e.s(["W",()=>i])},758630,e=>{"use strict";var r=e.i(843476),s=e.i(271645);let n=s.forwardRef(function({title:e,titleId:r,...n},i){return s.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:i,"aria-labelledby":r},n),e?s.createElement("title",{id:r},e):null,s.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"}))}),i=s.forwardRef(function({title:e,titleId:r,...n},i){return s.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:i,"aria-labelledby":r},n),e?s.createElement("title",{id:r},e):null,s.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"}))});var t=e.i(393794),t=t,o=e.i(997053),l=e.i(825158),a=e.i(355413),d=e.i(110696),c=e.i(921e3),h=e.i(290382),x=e.i(267669),j=e.i(317842),u=e.i(456842),m=e.i(108313),p=e.i(703421),g=e.i(345214),f=e.i(513153),y=e.i(133225),v=e.i(796516),k=e.i(272313),b=e.i(330604),w=e.i(873695),L=e.i(601972),A=e.i(851757);let R=s.forwardRef(function({title:e,titleId:r,...n},i){return s.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:i,"aria-labelledby":r},n),e?s.createElement("title",{id:r},e):null,s.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z"}))});var T=e.i(705630),V=e.i(515502);let C=(0,o.styled)(d.L)`
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--privy-color-accent);
  svg {
    fill: var(--privy-color-accent);
  }
`;var I=({iconUrl:e,value:s,symbol:n,usdValue:i,nftName:t,nftCount:o,decimals:l,$isLoading:a})=>{if(a)return(0,r.jsx)(S,{$isLoading:a});let d=s&&i&&l?function(e,r,s){let n=parseFloat(e),i=parseFloat(s);if(0===n||0===i||Number.isNaN(n)||Number.isNaN(i))return e;let t=Math.ceil(-Math.log10(.01/(i/n))),o=Math.pow(10,t=Math.max(t=Math.min(t,r),1)),l=+(Math.floor(n*o)/o).toFixed(t).replace(/\.?0+$/,"");return Intl.NumberFormat(void 0,{maximumFractionDigits:r}).format(l)}(s,l,i):s;return(0,r.jsxs)("div",{children:[(0,r.jsxs)(S,{$isLoading:a,children:[e&&(0,r.jsx)(E,{src:e,alt:"Token icon"}),o&&o>1?o+"x":void 0," ",t,d," ",n]}),i&&(0,r.jsxs)($,{$isLoading:a,children:["$",i]})]})};let S=o.styled.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  ${y.L}
`,$=o.styled.span`
  color: var(--privy-color-foreground-2);
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  ${y.L}
`,E=o.styled.img`
  height: 14px;
  width: 14px;
  margin-right: 4px;
  object-fit: contain;
`,M=e=>{let{chain:s,transactionDetails:n,isTokenContractInfoLoading:i,symbol:t}=e,{action:o,functionName:l}=n;return(0,r.jsx)(k.B,{children:(0,r.jsxs)(c.a,{children:["transaction"!==o&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Action"}),(0,r.jsx)(d.V,{children:l})]}),"mint"===l&&"args"in n&&n.args.filter(e=>e).map((e,n)=>(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:`Param ${n}`}),(0,r.jsx)(d.V,{children:"string"==typeof e&&(0,v.isAddress)(e)?(0,r.jsx)(m.A,{address:e,url:s?.blockExplorers?.default?.url,showCopyIcon:!1}):e?.toString()})]},n)),"setApprovalForAll"===l&&n.operator&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Operator"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:n.operator,url:s?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),"setApprovalForAll"===l&&void 0!==n.approved&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Set approval to"}),(0,r.jsx)(d.V,{children:n.approved?"true":"false"})]}),"transfer"===l||"transferFrom"===l||"safeTransferFrom"===l||"approve"===l?(0,r.jsxs)(r.Fragment,{children:["formattedAmount"in n&&n.formattedAmount&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount"}),(0,r.jsxs)(d.V,{$isLoading:i,children:[n.formattedAmount," ",t]})]}),"tokenId"in n&&n.tokenId&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token ID"}),(0,r.jsx)(d.V,{children:n.tokenId.toString()})]})]}):null,"safeBatchTransferFrom"===l&&(0,r.jsxs)(r.Fragment,{children:["amounts"in n&&n.amounts&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amounts"}),(0,r.jsx)(d.V,{children:n.amounts.join(", ")})]}),"tokenIds"in n&&n.tokenIds&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token IDs"}),(0,r.jsx)(d.V,{children:n.tokenIds.join(", ")})]})]}),"approve"===l&&n.spender&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Spender"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:n.spender,url:s?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),("transferFrom"===l||"safeTransferFrom"===l||"safeBatchTransferFrom"===l)&&n.transferFrom&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Transferring from"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:n.transferFrom,url:s?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),("transferFrom"===l||"safeTransferFrom"===l||"safeBatchTransferFrom"===l)&&n.transferTo&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Transferring to"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:n.transferTo,url:s?.blockExplorers?.default?.url,showCopyIcon:!1})})]})]})})},F=({variant:e,setPreventMaliciousTransaction:s,colorScheme:n="light",preventMaliciousTransaction:i})=>"warn"===e?(0,r.jsx)(O,{children:(0,r.jsxs)(L.W,{theme:n,children:[(0,r.jsx)("span",{style:{fontWeight:"500"},children:"Warning: Suspicious transaction"}),(0,r.jsx)("br",{}),"This has been flagged as a potentially deceptive request. Approving could put your assets or funds at risk."]})}):"error"===e?(0,r.jsx)(r.Fragment,{children:(0,r.jsxs)(O,{children:[(0,r.jsx)(w.E,{theme:n,children:(0,r.jsxs)("div",{children:[(0,r.jsx)("strong",{children:"This is a malicious transaction"}),(0,r.jsx)("br",{}),"This transaction transfers tokens to a known malicious address. Proceeding may result in the loss of valuable assets."]})}),(0,r.jsxs)(N,{children:[(0,r.jsx)(b.C,{color:"var(--privy-color-error)",checked:!i,readOnly:!0,onClick:()=>s(!i)}),(0,r.jsx)("span",{children:"I understand and want to proceed anyways."})]})]})}):null,O=o.styled.div`
  margin-top: 1.5rem;
`,N=o.styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
`,z=({transactionIndex:e,maxIndex:r})=>"number"!=typeof e||0===r?"":` (${e+1} / ${r+1})`,D=({img:e,submitError:o,prepareError:l,onClose:x,action:p,title:y,subtitle:v,to:k,tokenAddress:b,network:w,missingFunds:L,fee:A,from:R,cta:T,disabled:V,chain:S,isSubmitting:$,isPreparing:E,isTokenPriceLoading:O,isTokenContractInfoLoading:N,isSponsored:D,symbol:P,balance:W,onClick:J,transactionDetails:K,transactionIndex:Q,maxIndex:Z,onBack:_,chainName:G,validation:X,hasScanDetails:ee,setIsScanDetailsOpen:er,preventMaliciousTransaction:es,setPreventMaliciousTransaction:en,tokensSent:ei,tokensReceived:et,isScanning:eo,isCancellable:el,functionName:ea})=>{let{showTransactionDetails:ed,setShowTransactionDetails:ec,hasMoreDetails:eh,isErc20Ish:ex}=(e=>{let[r,n]=(0,s.useState)(!1),i=!0,t=!1;return(!e||e.isErc20Ish||"transaction"===e.action)&&(i=!1),i&&(t=Object.entries(e||{}).some(([e,r])=>r&&!["action","isErc20Ish","isNFTIsh"].includes(e))),{showTransactionDetails:r,setShowTransactionDetails:n,hasMoreDetails:i&&t,isErc20Ish:e?.isErc20Ish}})(K),ej=(0,g.u)(),eu=ex&&N||E||O||eo;return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(a.M,{onClose:x,backFn:_}),e&&(0,r.jsx)(U,{children:e}),(0,r.jsxs)(u.T,{style:{marginTop:e?"1.5rem":0},children:[y,(0,r.jsx)(z,{maxIndex:Z,transactionIndex:Q})]}),(0,r.jsx)(j.S,{children:v}),(0,r.jsxs)(c.a,{style:{marginTop:"2rem"},children:[(!!ei[0]||eu)&&(0,r.jsxs)(c.R,{children:[et.length>0?(0,r.jsx)(d.L,{children:"Send"}):(0,r.jsx)(d.L,{children:"approve"===p?"Approval amount":"Amount"}),(0,r.jsx)("div",{className:"flex flex-col",children:ei.map((e,s)=>(0,r.jsx)(I,{iconUrl:e.iconUrl,value:"setApprovalForAll"===ea?"All":e.value,usdValue:e.usdValue,symbol:e.symbol,nftName:e.nftName,nftCount:e.nftCount,decimals:e.decimals},s))})]}),et.length>0&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Receive"}),(0,r.jsx)("div",{className:"flex flex-col",children:et.map((e,s)=>(0,r.jsx)(I,{iconUrl:e.iconUrl,value:e.value,usdValue:e.usdValue,symbol:e.symbol,nftName:e.nftName,nftCount:e.nftCount,decimals:e.decimals},s))})]}),K&&"spender"in K&&K?.spender?(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Spender"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:K.spender,url:S?.blockExplorers?.default?.url})})]}):null,k&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"To"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:k,url:S?.blockExplorers?.default?.url,showCopyIcon:!0})})]}),b&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token address"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:b,url:S?.blockExplorers?.default?.url})})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Network"}),(0,r.jsx)(d.V,{children:w})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Estimated fee"}),(0,r.jsx)(d.V,{$isLoading:E||O||void 0===D,children:D?(0,r.jsxs)(q,{children:[(0,r.jsxs)(Y,{children:["Sponsored by ",ej.name]}),(0,r.jsx)(n,{height:16,width:16})]}):A})]}),eh&&!ee&&(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(c.R,{className:"cursor-pointer",onClick:()=>ec(!ed),children:(0,r.jsxs)(d.a,{className:"flex items-center gap-x-1",children:["Details"," ",(0,r.jsx)(t.default,{style:{width:"0.75rem",marginLeft:"0.25rem",transform:ed?"rotate(180deg)":void 0}})]})}),ed&&K&&(0,r.jsx)(M,{action:p,chain:S,transactionDetails:K,isTokenContractInfoLoading:N,symbol:P})]}),ee&&(0,r.jsx)(c.R,{children:(0,r.jsxs)(C,{onClick:()=>er(!0),children:[(0,r.jsx)("span",{className:"text-color-primary",children:"Details"}),(0,r.jsx)(i,{height:"14px",width:"14px",strokeWidth:"2"})]})})]}),(0,r.jsx)(f.Y,{}),o?(0,r.jsx)(h.E,{style:{marginTop:"2rem"},children:o.message}):l&&0===Q?(0,r.jsx)(h.E,{style:{marginTop:"2rem"},children:l.shortMessage??H}):null,(0,r.jsx)(F,{variant:X,preventMaliciousTransaction:es,setPreventMaliciousTransaction:en}),(0,r.jsx)(B,{$useSmallMargins:!(!l&&!o&&"warn"!==X&&"error"!==X),address:R,balance:W,errMsg:E||l||o||!L?void 0:`Add funds on ${S?.name??G} to complete transaction.`}),(0,r.jsx)(a.P,{style:{marginTop:"1rem"},loading:$,disabled:V||E,onClick:J,children:T}),el&&(0,r.jsx)(a.E,{style:{marginTop:"1rem"},onClick:x,isSubmitting:!1,children:"Not now"}),(0,r.jsx)(a.B,{})]})},P=({img:e,title:i,subtitle:o,cta:p,instructions:y,network:v,blockExplorerUrl:k,isMissingFunds:b,submitError:w,parseError:L,total:A,swap:R,transactingWalletAddress:T,fee:V,balance:I,disabled:S,isSubmitting:$,isPreparing:E,isTokenPriceLoading:M,onClick:F,onClose:O,onBack:N,isSponsored:z})=>{let D=E||M,[P,J]=(0,s.useState)(!1),K=(0,g.u)();return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(a.M,{onClose:O,backFn:N}),e&&(0,r.jsx)(U,{children:e}),(0,r.jsx)(u.T,{style:{marginTop:e?"1.5rem":0},children:i}),(0,r.jsx)(j.S,{children:o}),(0,r.jsxs)(c.a,{style:{marginTop:"2rem",marginBottom:".5rem"},children:[(A||D)&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount"}),(0,r.jsx)(d.V,{$isLoading:D,children:A})]}),R&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Swap"}),(0,r.jsx)(d.V,{children:R})]}),v&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Network"}),(0,r.jsx)(d.V,{children:v})]}),(V||D||void 0!==z)&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Estimated fee"}),(0,r.jsx)(d.V,{$isLoading:D,children:z&&!D?(0,r.jsxs)(q,{children:[(0,r.jsxs)(Y,{children:["Sponsored by ",K.name]}),(0,r.jsx)(n,{height:16,width:16})]}):V})]})]}),(0,r.jsx)(c.R,{children:(0,r.jsxs)(C,{onClick:()=>J(e=>!e),children:[(0,r.jsx)("span",{children:"Advanced"}),(0,r.jsx)(t.default,{height:"16px",width:"16px",strokeWidth:"2",style:{transition:"all 300ms",transform:P?"rotate(180deg)":void 0}})]})}),P&&(0,r.jsx)(r.Fragment,{children:y.map((e,s)=>"sol-transfer"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsxs)(x.L,{children:["Transfer ",e.withSeed?"with seed":""]})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount"}),(0,r.jsxs)(d.V,{children:[(0,l.formatTokenAmount)({amount:e.value,decimals:e.token.decimals})," ",e.token.symbol]})]}),!!e.toAccount&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Destination"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.toAccount,url:k})})]})]},s):"spl-transfer"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsxs)(x.L,{children:["Transfer ",e.token.symbol]})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount"}),(0,r.jsx)(d.V,{children:e.value.toString()})]}),!!e.fromAta&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Source"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.fromAta,url:k})})]}),!!e.toAta&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Destination"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.toAta,url:k})})]}),!!e.token.address&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.token.address,url:k})})]})]},s):"ata-creation"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsx)(x.L,{children:"Create token account"})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Program ID"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.program,url:k})})]}),!!e.owner&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Owner"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.owner,url:k})})]})]},s):"create-account"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsxs)(x.L,{children:["Create account ",e.withSeed?"with seed":""]})}),!!e.account&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Account"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.account,url:k})})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount"}),(0,r.jsxs)(d.V,{children:[(0,l.formatTokenAmount)({amount:e.value,decimals:9})," SOL"]})]})]},s):"spl-init-account"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsx)(x.L,{children:"Initialize token account"})}),!!e.account&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Account"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.account,url:k})})]}),!!e.mint&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Mint"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mint,url:k})})]}),!!e.owner&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Owner"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.owner,url:k})})]})]},s):"spl-close-account"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsx)(x.L,{children:"Close token account"})}),!!e.source&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Source"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.source,url:k})})]}),!!e.destination&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Destination"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.destination,url:k})})]}),!!e.owner&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Owner"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.owner,url:k})})]})]},s):"spl-sync-native"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsx)(x.L,{children:"Sync native"})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Program ID"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.program,url:k})})]})]},s):"raydium-swap-base-input"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsxs)(x.L,{children:["Raydium swap"," ",e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:""]})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount in"}),(0,r.jsx)(d.V,{children:e.amountIn.toString()})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Minimum amount out"}),(0,r.jsx)(d.V,{children:e.minimumAmountOut.toString()})]}),e.mintIn&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token in"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintIn,url:k})})]}),e.mintOut&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token out"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintOut,url:k})})]})]},s):"raydium-swap-base-output"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsxs)(x.L,{children:["Raydium swap"," ",e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:""]})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Max amount in"}),(0,r.jsx)(d.V,{children:e.maxAmountIn.toString()})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount out"}),(0,r.jsx)(d.V,{children:e.amountOut.toString()})]}),e.mintIn&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token in"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintIn,url:k})})]}),e.mintOut&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token out"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintOut,url:k})})]})]},s):"jupiter-swap-shared-accounts-route"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsxs)(x.L,{children:["Jupiter swap"," ",e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:""]})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"In amount"}),(0,r.jsx)(d.V,{children:e.inAmount.toString()})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Quoted out amount"}),(0,r.jsx)(d.V,{children:e.quotedOutAmount.toString()})]}),e.mintIn&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token in"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintIn,url:k})})]}),e.mintOut&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token out"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintOut,url:k})})]})]},s):"jupiter-swap-exact-out-route"===e.type?(0,r.jsxs)(W,{children:[(0,r.jsx)(c.R,{children:(0,r.jsxs)(x.L,{children:["Jupiter swap"," ",e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:""]})}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Quoted in amount"}),(0,r.jsx)(d.V,{children:e.quotedInAmount.toString()})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Amount out"}),(0,r.jsx)(d.V,{children:e.outAmount.toString()})]}),e.mintIn&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token in"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintIn,url:k})})]}),e.mintOut&&(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Token out"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.mintOut,url:k})})]})]},s):(0,r.jsxs)(W,{children:[(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Program ID"}),(0,r.jsx)(d.V,{children:(0,r.jsx)(m.A,{address:e.program,url:k})})]}),(0,r.jsxs)(c.R,{children:[(0,r.jsx)(d.L,{children:"Data"}),(0,r.jsx)(d.V,{children:e.discriminator})]})]},s))}),(0,r.jsx)(f.Y,{}),w?(0,r.jsx)(h.E,{style:{marginTop:"2rem"},children:w.message}):L?(0,r.jsx)(h.E,{style:{marginTop:"2rem"},children:H}):null,(0,r.jsx)(B,{$useSmallMargins:!(!L&&!w),title:"",address:T,balance:I,errMsg:E||L||w||!b?void 0:"Add funds on Solana to complete transaction."}),(0,r.jsx)(a.P,{style:{marginTop:"1rem"},loading:$,disabled:S||E,onClick:F,children:p}),(0,r.jsx)(a.B,{})]})},B=(0,o.styled)(p.W)`
  ${e=>e.$useSmallMargins?"margin-top: 0.5rem;":"margin-top: 2rem;"}
`,W=(0,o.styled)(c.a)`
  margin-top: 0.5rem;
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-sm);
  padding: 0.5rem;
`,H="There was an error preparing your transaction. Your transaction request will likely fail.",U=o.styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
  max-height: 40px;

  > img {
    object-fit: contain;
    border-radius: var(--privy-border-radius-sm);
  }
`,q=o.styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
`,Y=o.styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,J=()=>(0,r.jsxs)(G,{children:[(0,r.jsx)(ee,{}),(0,r.jsx)(X,{})]}),K=({transactionError:e,chainId:n,onClose:i,onRetry:t,chainType:o,transactionHash:l})=>{let{chains:d}=(0,V.u)(),[c,h]=(0,s.useState)(!1),{errorCode:x,errorMessage:j}=((e,r)=>{if("ethereum"===r)return{errorCode:e.details??e.message,errorMessage:e.shortMessage};let s=e.txSignature,n=e?.transactionMessage||"Something went wrong.";if(Array.isArray(e.logs)){let r=e.logs.find(e=>/insufficient (lamports|funds)/gi.test(e));r&&(n=r)}return{transactionHash:s,errorMessage:n}})(e,o),u=(({chains:e,chainId:r,chainType:s,transactionHash:n})=>{var i;return"ethereum"===s?e.find(e=>e.id===r)?.blockExplorers?.default.url??"https://etherscan.io":(i=n||"",`https://explorer.solana.com/tx/${i}?chain=${r}`)})({chains:d,chainId:n,chainType:o,transactionHash:l});return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(a.M,{onClose:i}),(0,r.jsxs)(Q,{children:[(0,r.jsx)(J,{}),(0,r.jsx)(Z,{children:x}),(0,r.jsx)(_,{children:"Please try again."}),(0,r.jsxs)(en,{children:[(0,r.jsx)(es,{children:"Error message"}),(0,r.jsx)(et,{$clickable:!1,children:j})]}),l&&(0,r.jsxs)(en,{children:[(0,r.jsx)(es,{children:"Transaction hash"}),(0,r.jsxs)(ei,{children:["Copy this hash to view details about the transaction on a"," ",(0,r.jsx)("u",{children:(0,r.jsx)("a",{href:u,children:"block explorer"})}),"."]}),(0,r.jsxs)(et,{$clickable:!0,onClick:async()=>{await navigator.clipboard.writeText(l),h(!0)},children:[l,(0,r.jsx)(ea,{clicked:c})]})]}),(0,r.jsx)(er,{onClick:()=>t({resetNonce:!!l}),children:"Retry transaction"})]}),(0,r.jsx)(a.b,{})]})},Q=o.styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`,Z=o.styled.span`
  color: var(--privy-color-foreground);
  text-align: center;
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.25rem; /* 111.111% */
  text-align: center;
  margin: 10px;
`,_=o.styled.span`
  margin-top: 4px;
  margin-bottom: 10px;
  color: var(--privy-color-foreground-3);
  text-align: center;

  font-size: 0.875rem;
  font-style: normal;
  font-weight: 400;
  line-height: 20px; /* 142.857% */
  letter-spacing: -0.008px;
`,G=o.styled.div`
  position: relative;
  width: 60px;
  height: 60px;
  margin: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
`,X=(0,o.styled)(T.default)`
  position: absolute;
  width: 35px;
  height: 35px;
  color: var(--privy-color-error);
`,ee=o.styled.div`
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: var(--privy-color-error);
  opacity: 0.1;
`,er=(0,o.styled)(a.P)`
  && {
    margin-top: 24px;
  }
  transition:
    color 350ms ease,
    background-color 350ms ease;
`,es=o.styled.span`
  width: 100%;
  text-align: left;
  font-size: 0.825rem;
  color: var(--privy-color-foreground);
  padding: 4px;
`,en=o.styled.div`
  width: 100%;
  margin: 5px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`,ei=o.styled.text`
  position: relative;
  width: 100%;
  padding: 5px;
  font-size: 0.8rem;
  color: var(--privy-color-foreground-3);
  text-align: left;
  word-wrap: break-word;
`,et=o.styled.span`
  position: relative;
  width: 100%;
  background-color: var(--privy-color-background-2);
  padding: 8px 12px;
  border-radius: 10px;
  margin-top: 5px;
  font-size: 14px;
  color: var(--privy-color-foreground-3);
  text-align: left;
  word-wrap: break-word;
  ${e=>e.$clickable&&"cursor: pointer;\n  transition: background-color 0.3s;\n  padding-right: 45px;\n\n  &:hover {\n    background-color: var(--privy-color-foreground-4);\n  }"}
`,eo=(0,o.styled)(R)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,el=(0,o.styled)(A.default)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,ea=({clicked:e})=>(0,r.jsx)(e?el:eo,{});e.s(["S",()=>D,"T",()=>K,"a",()=>P],758630)}]);