module.exports=[696180,a=>{"use strict";var b=a.i(187924),c=a.i(572131);let d=c.forwardRef(function({title:a,titleId:b,...d},e){return c.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:e,"aria-labelledby":b},d),a?c.createElement("title",{id:b},a):null,c.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"}))}),e=c.forwardRef(function({title:a,titleId:b,...d},e){return c.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:e,"aria-labelledby":b},d),a?c.createElement("title",{id:b},a):null,c.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"}))});var f=a.i(468859),f=f,g=a.i(775716),h=a.i(596758),i=a.i(215076),j=a.i(510103),k=a.i(974960),l=a.i(167931),m=a.i(607236),n=a.i(32145),o=a.i(219602),p=a.i(448356),q=a.i(353760),r=a.i(17533),s=a.i(649386),t=a.i(502279),u=a.i(540302),v=a.i(87992),w=a.i(890147),x=a.i(476355),y=a.i(169430),z=a.i(161649);let A=c.forwardRef(function({title:a,titleId:b,...d},e){return c.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:e,"aria-labelledby":b},d),a?c.createElement("title",{id:b},a):null,c.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z"}))});var B=a.i(618549),C=a.i(20246);let D=(0,g.styled)(j.L)`
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--privy-color-accent);
  svg {
    fill: var(--privy-color-accent);
  }
`;var E=({iconUrl:a,value:c,symbol:d,usdValue:e,nftName:f,nftCount:g,decimals:h,$isLoading:i})=>{if(i)return(0,b.jsx)(F,{$isLoading:i});let j=c&&e&&h?function(a,b,c){let d=parseFloat(a),e=parseFloat(c);if(0===d||0===e||Number.isNaN(d)||Number.isNaN(e))return a;let f=Math.ceil(-Math.log10(.01/(e/d))),g=Math.pow(10,f=Math.max(f=Math.min(f,b),1)),h=+(Math.floor(d*g)/g).toFixed(f).replace(/\.?0+$/,"");return Intl.NumberFormat(void 0,{maximumFractionDigits:b}).format(h)}(c,h,e):c;return(0,b.jsxs)("div",{children:[(0,b.jsxs)(F,{$isLoading:i,children:[a&&(0,b.jsx)(H,{src:a,alt:"Token icon"}),g&&g>1?g+"x":void 0," ",f,j," ",d]}),e&&(0,b.jsxs)(G,{$isLoading:i,children:["$",e]})]})};let F=g.styled.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  ${t.L}
`,G=g.styled.span`
  color: var(--privy-color-foreground-2);
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  ${t.L}
`,H=g.styled.img`
  height: 14px;
  width: 14px;
  margin-right: 4px;
  object-fit: contain;
`,I=a=>{let{chain:c,transactionDetails:d,isTokenContractInfoLoading:e,symbol:f}=a,{action:g,functionName:h}=d;return(0,b.jsx)(v.B,{children:(0,b.jsxs)(k.a,{children:["transaction"!==g&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Action"}),(0,b.jsx)(j.V,{children:h})]}),"mint"===h&&"args"in d&&d.args.filter(a=>a).map((a,d)=>(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:`Param ${d}`}),(0,b.jsx)(j.V,{children:"string"==typeof a&&(0,u.isAddress)(a)?(0,b.jsx)(p.A,{address:a,url:c?.blockExplorers?.default?.url,showCopyIcon:!1}):a?.toString()})]},d)),"setApprovalForAll"===h&&d.operator&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Operator"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:d.operator,url:c?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),"setApprovalForAll"===h&&void 0!==d.approved&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Set approval to"}),(0,b.jsx)(j.V,{children:d.approved?"true":"false"})]}),"transfer"===h||"transferFrom"===h||"safeTransferFrom"===h||"approve"===h?(0,b.jsxs)(b.Fragment,{children:["formattedAmount"in d&&d.formattedAmount&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount"}),(0,b.jsxs)(j.V,{$isLoading:e,children:[d.formattedAmount," ",f]})]}),"tokenId"in d&&d.tokenId&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token ID"}),(0,b.jsx)(j.V,{children:d.tokenId.toString()})]})]}):null,"safeBatchTransferFrom"===h&&(0,b.jsxs)(b.Fragment,{children:["amounts"in d&&d.amounts&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amounts"}),(0,b.jsx)(j.V,{children:d.amounts.join(", ")})]}),"tokenIds"in d&&d.tokenIds&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token IDs"}),(0,b.jsx)(j.V,{children:d.tokenIds.join(", ")})]})]}),"approve"===h&&d.spender&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Spender"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:d.spender,url:c?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),("transferFrom"===h||"safeTransferFrom"===h||"safeBatchTransferFrom"===h)&&d.transferFrom&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Transferring from"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:d.transferFrom,url:c?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),("transferFrom"===h||"safeTransferFrom"===h||"safeBatchTransferFrom"===h)&&d.transferTo&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Transferring to"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:d.transferTo,url:c?.blockExplorers?.default?.url,showCopyIcon:!1})})]})]})})},J=({variant:a,setPreventMaliciousTransaction:c,colorScheme:d="light",preventMaliciousTransaction:e})=>"warn"===a?(0,b.jsx)(K,{children:(0,b.jsxs)(y.W,{theme:d,children:[(0,b.jsx)("span",{style:{fontWeight:"500"},children:"Warning: Suspicious transaction"}),(0,b.jsx)("br",{}),"This has been flagged as a potentially deceptive request. Approving could put your assets or funds at risk."]})}):"error"===a?(0,b.jsx)(b.Fragment,{children:(0,b.jsxs)(K,{children:[(0,b.jsx)(x.E,{theme:d,children:(0,b.jsxs)("div",{children:[(0,b.jsx)("strong",{children:"This is a malicious transaction"}),(0,b.jsx)("br",{}),"This transaction transfers tokens to a known malicious address. Proceeding may result in the loss of valuable assets."]})}),(0,b.jsxs)(L,{children:[(0,b.jsx)(w.C,{color:"var(--privy-color-error)",checked:!e,readOnly:!0,onClick:()=>c(!e)}),(0,b.jsx)("span",{children:"I understand and want to proceed anyways."})]})]})}):null,K=g.styled.div`
  margin-top: 1.5rem;
`,L=g.styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
`,M=({transactionIndex:a,maxIndex:b})=>"number"!=typeof a||0===b?"":` (${a+1} / ${b+1})`,N=({img:a,submitError:g,prepareError:h,onClose:m,action:q,title:t,subtitle:u,to:v,tokenAddress:w,network:x,missingFunds:y,fee:z,from:A,cta:B,disabled:C,chain:F,isSubmitting:G,isPreparing:H,isTokenPriceLoading:K,isTokenContractInfoLoading:L,isSponsored:N,symbol:O,balance:Q,onClick:V,transactionDetails:W,transactionIndex:X,maxIndex:Y,onBack:Z,chainName:$,validation:_,hasScanDetails:aa,setIsScanDetailsOpen:ab,preventMaliciousTransaction:ac,setPreventMaliciousTransaction:ad,tokensSent:ae,tokensReceived:af,isScanning:ag,isCancellable:ah,functionName:ai})=>{let{showTransactionDetails:aj,setShowTransactionDetails:ak,hasMoreDetails:al,isErc20Ish:am}=(a=>{let[b,d]=(0,c.useState)(!1),e=!0,f=!1;return(!a||a.isErc20Ish||"transaction"===a.action)&&(e=!1),e&&(f=Object.entries(a||{}).some(([a,b])=>b&&!["action","isErc20Ish","isNFTIsh"].includes(a))),{showTransactionDetails:b,setShowTransactionDetails:d,hasMoreDetails:e&&f,isErc20Ish:a?.isErc20Ish}})(W),an=(0,r.u)(),ao=am&&L||H||K||ag;return(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(i.M,{onClose:m,backFn:Z}),a&&(0,b.jsx)(S,{children:a}),(0,b.jsxs)(o.T,{style:{marginTop:a?"1.5rem":0},children:[t,(0,b.jsx)(M,{maxIndex:Y,transactionIndex:X})]}),(0,b.jsx)(n.S,{children:u}),(0,b.jsxs)(k.a,{style:{marginTop:"2rem"},children:[(!!ae[0]||ao)&&(0,b.jsxs)(k.R,{children:[af.length>0?(0,b.jsx)(j.L,{children:"Send"}):(0,b.jsx)(j.L,{children:"approve"===q?"Approval amount":"Amount"}),(0,b.jsx)("div",{className:"flex flex-col",children:ae.map((a,c)=>(0,b.jsx)(E,{iconUrl:a.iconUrl,value:"setApprovalForAll"===ai?"All":a.value,usdValue:a.usdValue,symbol:a.symbol,nftName:a.nftName,nftCount:a.nftCount,decimals:a.decimals},c))})]}),af.length>0&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Receive"}),(0,b.jsx)("div",{className:"flex flex-col",children:af.map((a,c)=>(0,b.jsx)(E,{iconUrl:a.iconUrl,value:a.value,usdValue:a.usdValue,symbol:a.symbol,nftName:a.nftName,nftCount:a.nftCount,decimals:a.decimals},c))})]}),W&&"spender"in W&&W?.spender?(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Spender"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:W.spender,url:F?.blockExplorers?.default?.url})})]}):null,v&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"To"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:v,url:F?.blockExplorers?.default?.url,showCopyIcon:!0})})]}),w&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token address"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:w,url:F?.blockExplorers?.default?.url})})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Network"}),(0,b.jsx)(j.V,{children:x})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Estimated fee"}),(0,b.jsx)(j.V,{$isLoading:H||K||void 0===N,children:N?(0,b.jsxs)(T,{children:[(0,b.jsxs)(U,{children:["Sponsored by ",an.name]}),(0,b.jsx)(d,{height:16,width:16})]}):z})]}),al&&!aa&&(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(k.R,{className:"cursor-pointer",onClick:()=>ak(!aj),children:(0,b.jsxs)(j.a,{className:"flex items-center gap-x-1",children:["Details"," ",(0,b.jsx)(f.default,{style:{width:"0.75rem",marginLeft:"0.25rem",transform:aj?"rotate(180deg)":void 0}})]})}),aj&&W&&(0,b.jsx)(I,{action:q,chain:F,transactionDetails:W,isTokenContractInfoLoading:L,symbol:O})]}),aa&&(0,b.jsx)(k.R,{children:(0,b.jsxs)(D,{onClick:()=>ab(!0),children:[(0,b.jsx)("span",{className:"text-color-primary",children:"Details"}),(0,b.jsx)(e,{height:"14px",width:"14px",strokeWidth:"2"})]})})]}),(0,b.jsx)(s.Y,{}),g?(0,b.jsx)(l.E,{style:{marginTop:"2rem"},children:g.message}):h&&0===X?(0,b.jsx)(l.E,{style:{marginTop:"2rem"},children:h.shortMessage??R}):null,(0,b.jsx)(J,{variant:_,preventMaliciousTransaction:ac,setPreventMaliciousTransaction:ad}),(0,b.jsx)(P,{$useSmallMargins:!(!h&&!g&&"warn"!==_&&"error"!==_),address:A,balance:Q,errMsg:H||h||g||!y?void 0:`Add funds on ${F?.name??$} to complete transaction.`}),(0,b.jsx)(i.P,{style:{marginTop:"1rem"},loading:G,disabled:C||H,onClick:V,children:B}),ah&&(0,b.jsx)(i.E,{style:{marginTop:"1rem"},onClick:m,isSubmitting:!1,children:"Not now"}),(0,b.jsx)(i.B,{})]})},O=({img:a,title:e,subtitle:g,cta:q,instructions:t,network:u,blockExplorerUrl:v,isMissingFunds:w,submitError:x,parseError:y,total:z,swap:A,transactingWalletAddress:B,fee:C,balance:E,disabled:F,isSubmitting:G,isPreparing:H,isTokenPriceLoading:I,onClick:J,onClose:K,onBack:L,isSponsored:M})=>{let N=H||I,[O,V]=(0,c.useState)(!1),W=(0,r.u)();return(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(i.M,{onClose:K,backFn:L}),a&&(0,b.jsx)(S,{children:a}),(0,b.jsx)(o.T,{style:{marginTop:a?"1.5rem":0},children:e}),(0,b.jsx)(n.S,{children:g}),(0,b.jsxs)(k.a,{style:{marginTop:"2rem",marginBottom:".5rem"},children:[(z||N)&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount"}),(0,b.jsx)(j.V,{$isLoading:N,children:z})]}),A&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Swap"}),(0,b.jsx)(j.V,{children:A})]}),u&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Network"}),(0,b.jsx)(j.V,{children:u})]}),(C||N||void 0!==M)&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Estimated fee"}),(0,b.jsx)(j.V,{$isLoading:N,children:M&&!N?(0,b.jsxs)(T,{children:[(0,b.jsxs)(U,{children:["Sponsored by ",W.name]}),(0,b.jsx)(d,{height:16,width:16})]}):C})]})]}),(0,b.jsx)(k.R,{children:(0,b.jsxs)(D,{onClick:()=>V(a=>!a),children:[(0,b.jsx)("span",{children:"Advanced"}),(0,b.jsx)(f.default,{height:"16px",width:"16px",strokeWidth:"2",style:{transition:"all 300ms",transform:O?"rotate(180deg)":void 0}})]})}),O&&(0,b.jsx)(b.Fragment,{children:t.map((a,c)=>"sol-transfer"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsxs)(m.L,{children:["Transfer ",a.withSeed?"with seed":""]})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount"}),(0,b.jsxs)(j.V,{children:[(0,h.formatTokenAmount)({amount:a.value,decimals:a.token.decimals})," ",a.token.symbol]})]}),!!a.toAccount&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Destination"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.toAccount,url:v})})]})]},c):"spl-transfer"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsxs)(m.L,{children:["Transfer ",a.token.symbol]})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount"}),(0,b.jsx)(j.V,{children:a.value.toString()})]}),!!a.fromAta&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Source"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.fromAta,url:v})})]}),!!a.toAta&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Destination"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.toAta,url:v})})]}),!!a.token.address&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.token.address,url:v})})]})]},c):"ata-creation"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsx)(m.L,{children:"Create token account"})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Program ID"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.program,url:v})})]}),!!a.owner&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Owner"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.owner,url:v})})]})]},c):"create-account"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsxs)(m.L,{children:["Create account ",a.withSeed?"with seed":""]})}),!!a.account&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Account"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.account,url:v})})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount"}),(0,b.jsxs)(j.V,{children:[(0,h.formatTokenAmount)({amount:a.value,decimals:9})," SOL"]})]})]},c):"spl-init-account"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsx)(m.L,{children:"Initialize token account"})}),!!a.account&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Account"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.account,url:v})})]}),!!a.mint&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Mint"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mint,url:v})})]}),!!a.owner&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Owner"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.owner,url:v})})]})]},c):"spl-close-account"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsx)(m.L,{children:"Close token account"})}),!!a.source&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Source"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.source,url:v})})]}),!!a.destination&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Destination"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.destination,url:v})})]}),!!a.owner&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Owner"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.owner,url:v})})]})]},c):"spl-sync-native"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsx)(m.L,{children:"Sync native"})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Program ID"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.program,url:v})})]})]},c):"raydium-swap-base-input"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsxs)(m.L,{children:["Raydium swap"," ",a.tokenIn&&a.tokenOut?`${a.tokenIn.symbol} → ${a.tokenOut.symbol}`:""]})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount in"}),(0,b.jsx)(j.V,{children:a.amountIn.toString()})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Minimum amount out"}),(0,b.jsx)(j.V,{children:a.minimumAmountOut.toString()})]}),a.mintIn&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token in"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintIn,url:v})})]}),a.mintOut&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token out"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintOut,url:v})})]})]},c):"raydium-swap-base-output"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsxs)(m.L,{children:["Raydium swap"," ",a.tokenIn&&a.tokenOut?`${a.tokenIn.symbol} → ${a.tokenOut.symbol}`:""]})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Max amount in"}),(0,b.jsx)(j.V,{children:a.maxAmountIn.toString()})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount out"}),(0,b.jsx)(j.V,{children:a.amountOut.toString()})]}),a.mintIn&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token in"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintIn,url:v})})]}),a.mintOut&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token out"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintOut,url:v})})]})]},c):"jupiter-swap-shared-accounts-route"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsxs)(m.L,{children:["Jupiter swap"," ",a.tokenIn&&a.tokenOut?`${a.tokenIn.symbol} → ${a.tokenOut.symbol}`:""]})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"In amount"}),(0,b.jsx)(j.V,{children:a.inAmount.toString()})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Quoted out amount"}),(0,b.jsx)(j.V,{children:a.quotedOutAmount.toString()})]}),a.mintIn&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token in"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintIn,url:v})})]}),a.mintOut&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token out"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintOut,url:v})})]})]},c):"jupiter-swap-exact-out-route"===a.type?(0,b.jsxs)(Q,{children:[(0,b.jsx)(k.R,{children:(0,b.jsxs)(m.L,{children:["Jupiter swap"," ",a.tokenIn&&a.tokenOut?`${a.tokenIn.symbol} → ${a.tokenOut.symbol}`:""]})}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Quoted in amount"}),(0,b.jsx)(j.V,{children:a.quotedInAmount.toString()})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Amount out"}),(0,b.jsx)(j.V,{children:a.outAmount.toString()})]}),a.mintIn&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token in"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintIn,url:v})})]}),a.mintOut&&(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Token out"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.mintOut,url:v})})]})]},c):(0,b.jsxs)(Q,{children:[(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Program ID"}),(0,b.jsx)(j.V,{children:(0,b.jsx)(p.A,{address:a.program,url:v})})]}),(0,b.jsxs)(k.R,{children:[(0,b.jsx)(j.L,{children:"Data"}),(0,b.jsx)(j.V,{children:a.discriminator})]})]},c))}),(0,b.jsx)(s.Y,{}),x?(0,b.jsx)(l.E,{style:{marginTop:"2rem"},children:x.message}):y?(0,b.jsx)(l.E,{style:{marginTop:"2rem"},children:R}):null,(0,b.jsx)(P,{$useSmallMargins:!(!y&&!x),title:"",address:B,balance:E,errMsg:H||y||x||!w?void 0:"Add funds on Solana to complete transaction."}),(0,b.jsx)(i.P,{style:{marginTop:"1rem"},loading:G,disabled:F||H,onClick:J,children:q}),(0,b.jsx)(i.B,{})]})},P=(0,g.styled)(q.W)`
  ${a=>a.$useSmallMargins?"margin-top: 0.5rem;":"margin-top: 2rem;"}
`,Q=(0,g.styled)(k.a)`
  margin-top: 0.5rem;
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-sm);
  padding: 0.5rem;
`,R="There was an error preparing your transaction. Your transaction request will likely fail.",S=g.styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
  max-height: 40px;

  > img {
    object-fit: contain;
    border-radius: var(--privy-border-radius-sm);
  }
`,T=g.styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
`,U=g.styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,V=()=>(0,b.jsxs)($,{children:[(0,b.jsx)(aa,{}),(0,b.jsx)(_,{})]}),W=({transactionError:a,chainId:d,onClose:e,onRetry:f,chainType:g,transactionHash:h})=>{let{chains:j}=(0,C.u)(),[k,l]=(0,c.useState)(!1),{errorCode:m,errorMessage:n}=((a,b)=>{if("ethereum"===b)return{errorCode:a.details??a.message,errorMessage:a.shortMessage};let c=a.txSignature,d=a?.transactionMessage||"Something went wrong.";if(Array.isArray(a.logs)){let b=a.logs.find(a=>/insufficient (lamports|funds)/gi.test(a));b&&(d=b)}return{transactionHash:c,errorMessage:d}})(a,g),o=(({chains:a,chainId:b,chainType:c,transactionHash:d})=>{var e;return"ethereum"===c?a.find(a=>a.id===b)?.blockExplorers?.default.url??"https://etherscan.io":(e=d||"",`https://explorer.solana.com/tx/${e}?chain=${b}`)})({chains:j,chainId:d,chainType:g,transactionHash:h});return(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(i.M,{onClose:e}),(0,b.jsxs)(X,{children:[(0,b.jsx)(V,{}),(0,b.jsx)(Y,{children:m}),(0,b.jsx)(Z,{children:"Please try again."}),(0,b.jsxs)(ad,{children:[(0,b.jsx)(ac,{children:"Error message"}),(0,b.jsx)(af,{$clickable:!1,children:n})]}),h&&(0,b.jsxs)(ad,{children:[(0,b.jsx)(ac,{children:"Transaction hash"}),(0,b.jsxs)(ae,{children:["Copy this hash to view details about the transaction on a"," ",(0,b.jsx)("u",{children:(0,b.jsx)("a",{href:o,children:"block explorer"})}),"."]}),(0,b.jsxs)(af,{$clickable:!0,onClick:async()=>{await navigator.clipboard.writeText(h),l(!0)},children:[h,(0,b.jsx)(ai,{clicked:k})]})]}),(0,b.jsx)(ab,{onClick:()=>f({resetNonce:!!h}),children:"Retry transaction"})]}),(0,b.jsx)(i.b,{})]})},X=g.styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`,Y=g.styled.span`
  color: var(--privy-color-foreground);
  text-align: center;
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.25rem; /* 111.111% */
  text-align: center;
  margin: 10px;
`,Z=g.styled.span`
  margin-top: 4px;
  margin-bottom: 10px;
  color: var(--privy-color-foreground-3);
  text-align: center;

  font-size: 0.875rem;
  font-style: normal;
  font-weight: 400;
  line-height: 20px; /* 142.857% */
  letter-spacing: -0.008px;
`,$=g.styled.div`
  position: relative;
  width: 60px;
  height: 60px;
  margin: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
`,_=(0,g.styled)(B.default)`
  position: absolute;
  width: 35px;
  height: 35px;
  color: var(--privy-color-error);
`,aa=g.styled.div`
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: var(--privy-color-error);
  opacity: 0.1;
`,ab=(0,g.styled)(i.P)`
  && {
    margin-top: 24px;
  }
  transition:
    color 350ms ease,
    background-color 350ms ease;
`,ac=g.styled.span`
  width: 100%;
  text-align: left;
  font-size: 0.825rem;
  color: var(--privy-color-foreground);
  padding: 4px;
`,ad=g.styled.div`
  width: 100%;
  margin: 5px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`,ae=g.styled.text`
  position: relative;
  width: 100%;
  padding: 5px;
  font-size: 0.8rem;
  color: var(--privy-color-foreground-3);
  text-align: left;
  word-wrap: break-word;
`,af=g.styled.span`
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
  ${a=>a.$clickable&&"cursor: pointer;\n  transition: background-color 0.3s;\n  padding-right: 45px;\n\n  &:hover {\n    background-color: var(--privy-color-foreground-4);\n  }"}
`,ag=(0,g.styled)(A)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,ah=(0,g.styled)(z.default)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,ai=({clicked:a})=>(0,b.jsx)(a?ah:ag,{});a.s(["S",()=>N,"T",()=>W,"a",()=>O],696180)}];

//# sourceMappingURL=a9bf9_%40privy-io_react-auth_dist_esm_TransactionErrorView-CkMh0sTl_mjs_b535b878._.js.map