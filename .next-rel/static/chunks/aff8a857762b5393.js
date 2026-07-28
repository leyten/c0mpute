(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,271502,e=>{"use strict";e.i(812207);var t=e.i(604148),o=e.i(654479);e.i(374576);var r=e.i(120119),i=e.i(56350);e.i(234051);var a=e.i(829389),n=e.i(401564),s=e.i(150576),l=e.i(886259),c=e.i(960398),d=e.i(149454),u=e.i(227302),p=e.i(803468),m=e.i(971080),h=e.i(221728),w=e.i(218454);let g={isUnsupportedChainView:()=>"UnsupportedChain"===h.RouterController.state.view||"SwitchNetwork"===h.RouterController.state.view&&h.RouterController.state.history.includes("UnsupportedChain"),async safeClose(){this.isUnsupportedChainView()||await w.SIWXUtil.isSIWXCloseDisabled()?p.ModalController.shake():(("DataCapture"===h.RouterController.state.view||"DataCaptureOtpConfirm"===h.RouterController.state.view)&&m.ConnectionController.disconnect(),p.ModalController.close())}};var v=e.i(82283),f=e.i(811424),b=e.i(365801),y=e.i(742710),k=e.i(675457),C=e.i(979484),x=e.i(518887),T=e.i(564126),S=e.i(360334),A=e.i(664717);let P={getGasPriceInEther:(e,t)=>Number(t*e)/1e18,getGasPriceInUSD(e,t,o){let r=P.getGasPriceInEther(t,o);return k.NumberUtil.bigNumber(e).times(r).toNumber()},getPriceImpact({sourceTokenAmount:e,sourceTokenPriceInUSD:t,toTokenPriceInUSD:o,toTokenAmount:r}){let i=k.NumberUtil.bigNumber(e).times(t),a=k.NumberUtil.bigNumber(r).times(o);return i.minus(a).div(i).times(100).toNumber()},getMaxSlippage(e,t){let o=k.NumberUtil.bigNumber(e).div(100);return k.NumberUtil.multiply(t,o).toNumber()},getProviderFee:(e,t=.0085)=>k.NumberUtil.bigNumber(e).times(t).toString(),isInsufficientNetworkTokenForGas:(e,t)=>!!k.NumberUtil.bigNumber(e).eq(0)||k.NumberUtil.bigNumber(k.NumberUtil.bigNumber(t||"0")).gt(e),isInsufficientSourceTokenForSwap(e,t,o){let r=o?.find(e=>e.address===t)?.quantity?.numeric;return k.NumberUtil.bigNumber(r||"0").lt(e)}};var $=e.i(592279),E=e.i(851887),R=e.i(24742),I=e.i(653157);let N={initializing:!1,initialized:!1,loadingPrices:!1,loadingQuote:!1,loadingApprovalTransaction:!1,loadingBuildTransaction:!1,loadingTransaction:!1,switchingTokens:!1,fetchError:!1,approvalTransaction:void 0,swapTransaction:void 0,transactionError:void 0,sourceToken:void 0,sourceTokenAmount:"",sourceTokenPriceInUSD:0,toToken:void 0,toTokenAmount:"",toTokenPriceInUSD:0,networkPrice:"0",networkBalanceInUSD:"0",networkTokenSymbol:"",inputError:void 0,slippage:S.ConstantsUtil.CONVERT_SLIPPAGE_TOLERANCE,tokens:void 0,popularTokens:void 0,suggestedTokens:void 0,foundTokens:void 0,myTokensWithBalance:void 0,tokensPriceMap:{},gasFee:"0",gasPriceInUSD:0,priceImpact:void 0,maxSlippage:void 0,providerFee:void 0},W=(0,b.proxy)({...N}),O={state:W,subscribe:e=>(0,b.subscribe)(W,()=>e(W)),subscribeKey:(e,t)=>(0,y.subscribeKey)(W,e,t),getParams(){let e=c.ChainController.state.activeChain,t=c.ChainController.getAccountData(e)?.caipAddress??c.ChainController.state.activeCaipAddress,o=u.CoreHelperUtil.getPlainAddress(t),r=(0,T.getActiveNetworkTokenAddress)(),i=d.ConnectorController.getConnectorId(c.ChainController.state.activeChain);if(!o)throw Error("No address found to swap the tokens from.");let a=!W.toToken?.address||!W.toToken?.decimals,s=!W.sourceToken?.address||!W.sourceToken?.decimals||!k.NumberUtil.bigNumber(W.sourceTokenAmount).gt(0),l=!W.sourceTokenAmount;return{networkAddress:r,fromAddress:o,fromCaipAddress:t,sourceTokenAddress:W.sourceToken?.address,toTokenAddress:W.toToken?.address,toTokenAmount:W.toTokenAmount,toTokenDecimals:W.toToken?.decimals,sourceTokenAmount:W.sourceTokenAmount,sourceTokenDecimals:W.sourceToken?.decimals,invalidToToken:a,invalidSourceToken:s,invalidSourceTokenAmount:l,availableToSwap:t&&!a&&!s&&!l,isAuthConnector:i===n.ConstantsUtil.CONNECTOR_ID.AUTH}},async setSourceToken(e){if(!e){W.sourceToken=e,W.sourceTokenAmount="",W.sourceTokenPriceInUSD=0;return}W.sourceToken=e,await U.setTokenPrice(e.address,"sourceToken")},setSourceTokenAmount(e){W.sourceTokenAmount=e},async setToToken(e){if(!e){W.toToken=e,W.toTokenAmount="",W.toTokenPriceInUSD=0;return}W.toToken=e,await U.setTokenPrice(e.address,"toToken")},setToTokenAmount(e){W.toTokenAmount=e?k.NumberUtil.toFixed(e,6):""},async setTokenPrice(e,t){let o=W.tokensPriceMap[e]||0;o||(W.loadingPrices=!0,o=await U.getAddressPrice(e)),"sourceToken"===t?W.sourceTokenPriceInUSD=o:"toToken"===t&&(W.toTokenPriceInUSD=o),W.loadingPrices&&(W.loadingPrices=!1),U.getParams().availableToSwap&&!W.switchingTokens&&U.swapTokens()},async switchTokens(){if(!W.initializing&&W.initialized&&!W.switchingTokens){W.switchingTokens=!0;try{let e=W.toToken?{...W.toToken}:void 0,t=W.sourceToken?{...W.sourceToken}:void 0,o=e&&""===W.toTokenAmount?"1":W.toTokenAmount;U.setSourceTokenAmount(o),U.setToTokenAmount(""),await U.setSourceToken(e),await U.setToToken(t),W.switchingTokens=!1,U.swapTokens()}catch(e){throw W.switchingTokens=!1,e}}},resetState(){W.myTokensWithBalance=N.myTokensWithBalance,W.tokensPriceMap=N.tokensPriceMap,W.initialized=N.initialized,W.initializing=N.initializing,W.switchingTokens=N.switchingTokens,W.sourceToken=N.sourceToken,W.sourceTokenAmount=N.sourceTokenAmount,W.sourceTokenPriceInUSD=N.sourceTokenPriceInUSD,W.toToken=N.toToken,W.toTokenAmount=N.toTokenAmount,W.toTokenPriceInUSD=N.toTokenPriceInUSD,W.networkPrice=N.networkPrice,W.networkTokenSymbol=N.networkTokenSymbol,W.networkBalanceInUSD=N.networkBalanceInUSD,W.inputError=N.inputError},resetValues(){let{networkAddress:e}=U.getParams(),t=W.tokens?.find(t=>t.address===e);U.setSourceToken(t),U.setToToken(void 0)},getApprovalLoadingState:()=>W.loadingApprovalTransaction,clearError(){W.transactionError=void 0},async initializeState(){if(!W.initializing){if(W.initializing=!0,!W.initialized)try{await U.fetchTokens(),W.initialized=!0}catch(e){W.initialized=!1,f.SnackController.showError("Failed to initialize swap"),h.RouterController.goBack()}W.initializing=!1}},async fetchTokens(){let{networkAddress:e}=U.getParams();await U.getNetworkTokenPrice(),await U.getMyTokensWithBalance();let t=W.myTokensWithBalance?.find(t=>t.address===e);t&&(W.networkTokenSymbol=t.symbol,U.setSourceToken(t),U.setSourceTokenAmount("0"))},async getTokenList(){let e=c.ChainController.state.activeCaipNetwork?.caipNetworkId;if(W.caipNetworkId!==e||!W.tokens)try{W.tokensLoading=!0;let t=await A.SwapApiUtil.getTokenList(e);W.tokens=t,W.caipNetworkId=e,W.popularTokens=t.sort((e,t)=>e.symbol<t.symbol?-1:+(e.symbol>t.symbol)),W.suggestedTokens=t.filter(e=>!!S.ConstantsUtil.SWAP_SUGGESTED_TOKENS.includes(e.symbol))}catch(e){W.tokens=[],W.popularTokens=[],W.suggestedTokens=[]}finally{W.tokensLoading=!1}},async getAddressPrice(e){let t=W.tokensPriceMap[e];if(t)return t;let o=await R.BlockchainApiController.fetchTokenPrice({addresses:[e]}),r=o?.fungibles||[],i=[...W.tokens||[],...W.myTokensWithBalance||[]],a=i?.find(t=>t.address===e)?.symbol,n=parseFloat((r.find(e=>e.symbol.toLowerCase()===a?.toLowerCase())?.price||0).toString());return W.tokensPriceMap[e]=n,n},async getNetworkTokenPrice(){let{networkAddress:e}=U.getParams(),t=await R.BlockchainApiController.fetchTokenPrice({addresses:[e]}).catch(()=>(f.SnackController.showError("Failed to fetch network token price"),{fungibles:[]})),o=t.fungibles?.[0],r=o?.price.toString()||"0";W.tokensPriceMap[e]=parseFloat(r),W.networkTokenSymbol=o?.symbol||"",W.networkPrice=r},async getMyTokensWithBalance(e){let t=await x.BalanceUtil.getMyTokensWithBalance(e),o=A.SwapApiUtil.mapBalancesToSwapTokens(t);o&&(await U.getInitialGasPrice(),U.setBalances(o))},setBalances(e){let{networkAddress:t}=U.getParams(),o=c.ChainController.state.activeCaipNetwork;if(!o)return;let r=e.find(e=>e.address===t);e.forEach(e=>{W.tokensPriceMap[e.address]=e.price||0}),W.myTokensWithBalance=e.filter(e=>e.address.startsWith(o.caipNetworkId)),W.networkBalanceInUSD=r?k.NumberUtil.multiply(r.quantity.numeric,r.price).toString():"0"},async getInitialGasPrice(){let e=await A.SwapApiUtil.fetchGasPrice();if(!e)return{gasPrice:null,gasPriceInUSD:null};switch(c.ChainController.state?.activeCaipNetwork?.chainNamespace){case n.ConstantsUtil.CHAIN.SOLANA:return W.gasFee=e.standard??"0",W.gasPriceInUSD=k.NumberUtil.multiply(e.standard,W.networkPrice).div(1e9).toNumber(),{gasPrice:BigInt(W.gasFee),gasPriceInUSD:Number(W.gasPriceInUSD)};case n.ConstantsUtil.CHAIN.EVM:default:let t=e.standard??"0",o=BigInt(t),r=BigInt(15e4),i=P.getGasPriceInUSD(W.networkPrice,r,o);return W.gasFee=t,W.gasPriceInUSD=i,{gasPrice:o,gasPriceInUSD:i}}},async swapTokens(){let e=c.ChainController.getAccountData()?.address,t=W.sourceToken,o=W.toToken,r=k.NumberUtil.bigNumber(W.sourceTokenAmount).gt(0);if(r||U.setToTokenAmount(""),!o||!t||W.loadingPrices||!r||!e)return;W.loadingQuote=!0;let i=k.NumberUtil.bigNumber(W.sourceTokenAmount).times(10**t.decimals).round(0);try{let r=await R.BlockchainApiController.fetchSwapQuote({userAddress:e,from:t.address,to:o.address,gasPrice:W.gasFee,amount:i.toString()});W.loadingQuote=!1;let a=r?.quotes?.[0]?.toAmount;if(!a)return void E.AlertController.open({displayMessage:"Incorrect amount",debugMessage:"Please enter a valid amount"},"error");let n=k.NumberUtil.bigNumber(a).div(10**o.decimals).toString();U.setToTokenAmount(n),U.hasInsufficientToken(W.sourceTokenAmount,t.address)?W.inputError="Insufficient balance":(W.inputError=void 0,U.setTransactionDetails())}catch(t){let e=await A.SwapApiUtil.handleSwapError(t);W.loadingQuote=!1,W.inputError=e||"Insufficient balance"}},async getTransaction(){let{fromCaipAddress:e,availableToSwap:t}=U.getParams(),o=W.sourceToken,r=W.toToken;if(e&&t&&o&&r&&!W.loadingQuote)try{let t;return W.loadingBuildTransaction=!0,t=await A.SwapApiUtil.fetchSwapAllowance({userAddress:e,tokenAddress:o.address,sourceTokenAmount:W.sourceTokenAmount,sourceTokenDecimals:o.decimals})?await U.createSwapTransaction():await U.createAllowanceTransaction(),W.loadingBuildTransaction=!1,W.fetchError=!1,t}catch(e){h.RouterController.goBack(),f.SnackController.showError("Failed to check allowance"),W.loadingBuildTransaction=!1,W.approvalTransaction=void 0,W.swapTransaction=void 0,W.fetchError=!0;return}},async createAllowanceTransaction(){let{fromCaipAddress:e,sourceTokenAddress:t,toTokenAddress:o}=U.getParams();if(e&&o){if(!t)throw Error("createAllowanceTransaction - No source token address found.");try{let r=await R.BlockchainApiController.generateApproveCalldata({from:t,to:o,userAddress:e}),i=u.CoreHelperUtil.getPlainAddress(r.tx.from);if(!i)throw Error("SwapController:createAllowanceTransaction - address is required");let a={data:r.tx.data,to:i,gasPrice:BigInt(r.tx.eip155.gasPrice),value:BigInt(r.tx.value),toAmount:W.toTokenAmount};return W.swapTransaction=void 0,W.approvalTransaction={data:a.data,to:a.to,gasPrice:a.gasPrice,value:a.value,toAmount:a.toAmount},{data:a.data,to:a.to,gasPrice:a.gasPrice,value:a.value,toAmount:a.toAmount}}catch(e){h.RouterController.goBack(),f.SnackController.showError("Failed to create approval transaction"),W.approvalTransaction=void 0,W.swapTransaction=void 0,W.fetchError=!0;return}}},async createSwapTransaction(){let{networkAddress:e,fromCaipAddress:t,sourceTokenAmount:o}=U.getParams(),r=W.sourceToken,i=W.toToken;if(!t||!o||!r||!i)return;let a=m.ConnectionController.parseUnits(o,r.decimals)?.toString();try{let o=await R.BlockchainApiController.generateSwapCalldata({userAddress:t,from:r.address,to:i.address,amount:a,disableEstimate:!0}),n=r.address===e,s=BigInt(o.tx.eip155.gas),l=BigInt(o.tx.eip155.gasPrice),c=u.CoreHelperUtil.getPlainAddress(o.tx.to);if(!c)throw Error("SwapController:createSwapTransaction - address is required");let d={data:o.tx.data,to:c,gas:s,gasPrice:l,value:n?BigInt(a??"0"):BigInt("0"),toAmount:W.toTokenAmount};return W.gasPriceInUSD=P.getGasPriceInUSD(W.networkPrice,s,l),W.approvalTransaction=void 0,W.swapTransaction=d,d}catch(e){h.RouterController.goBack(),f.SnackController.showError("Failed to create transaction"),W.approvalTransaction=void 0,W.swapTransaction=void 0,W.fetchError=!0;return}},onEmbeddedWalletApprovalSuccess(){f.SnackController.showLoading("Approve limit increase in your wallet"),h.RouterController.replace("SwapPreview")},async sendTransactionForApproval(e){let{fromAddress:t,isAuthConnector:o}=U.getParams();W.loadingApprovalTransaction=!0,o?h.RouterController.pushTransactionStack({onSuccess:U.onEmbeddedWalletApprovalSuccess}):f.SnackController.showLoading("Approve limit increase in your wallet");try{await m.ConnectionController.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:n.ConstantsUtil.CHAIN.EVM}),await U.swapTokens(),await U.getTransaction(),W.approvalTransaction=void 0,W.loadingApprovalTransaction=!1}catch(e){W.transactionError=e?.displayMessage,W.loadingApprovalTransaction=!1,f.SnackController.showError(e?.displayMessage||"Transaction error"),I.EventsController.sendEvent({type:"track",event:"SWAP_APPROVAL_ERROR",properties:{message:e?.displayMessage||e?.message||"Unknown",network:c.ChainController.state.activeCaipNetwork?.caipNetworkId||"",swapFromToken:U.state.sourceToken?.symbol||"",swapToToken:U.state.toToken?.symbol||"",swapFromAmount:U.state.sourceTokenAmount||"",swapToAmount:U.state.toTokenAmount||"",isSmartAccount:(0,T.getPreferredAccountType)(n.ConstantsUtil.CHAIN.EVM)===C.W3mFrameRpcConstants.ACCOUNT_TYPES.SMART_ACCOUNT}})}},async sendTransactionForSwap(e){if(!e)return;let{fromAddress:t,toTokenAmount:o,isAuthConnector:r}=U.getParams();W.loadingTransaction=!0;let i=`Swapping ${W.sourceToken?.symbol} to ${k.NumberUtil.formatNumberToLocalString(o,3)} ${W.toToken?.symbol}`,a=`Swapped ${W.sourceToken?.symbol} to ${k.NumberUtil.formatNumberToLocalString(o,3)} ${W.toToken?.symbol}`;r?h.RouterController.pushTransactionStack({onSuccess(){h.RouterController.replace("Account"),f.SnackController.showLoading(i),O.resetState()}}):f.SnackController.showLoading("Confirm transaction in your wallet");try{let o=[W.sourceToken?.address,W.toToken?.address].join(","),i=await m.ConnectionController.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:n.ConstantsUtil.CHAIN.EVM});return W.loadingTransaction=!1,f.SnackController.showSuccess(a),I.EventsController.sendEvent({type:"track",event:"SWAP_SUCCESS",properties:{network:c.ChainController.state.activeCaipNetwork?.caipNetworkId||"",swapFromToken:U.state.sourceToken?.symbol||"",swapToToken:U.state.toToken?.symbol||"",swapFromAmount:U.state.sourceTokenAmount||"",swapToAmount:U.state.toTokenAmount||"",isSmartAccount:(0,T.getPreferredAccountType)(n.ConstantsUtil.CHAIN.EVM)===C.W3mFrameRpcConstants.ACCOUNT_TYPES.SMART_ACCOUNT}}),O.resetState(),r||h.RouterController.replace("Account"),O.getMyTokensWithBalance(o),i}catch(e){W.transactionError=e?.displayMessage,W.loadingTransaction=!1,f.SnackController.showError(e?.displayMessage||"Transaction error"),I.EventsController.sendEvent({type:"track",event:"SWAP_ERROR",properties:{message:e?.displayMessage||e?.message||"Unknown",network:c.ChainController.state.activeCaipNetwork?.caipNetworkId||"",swapFromToken:U.state.sourceToken?.symbol||"",swapToToken:U.state.toToken?.symbol||"",swapFromAmount:U.state.sourceTokenAmount||"",swapToAmount:U.state.toTokenAmount||"",isSmartAccount:(0,T.getPreferredAccountType)(n.ConstantsUtil.CHAIN.EVM)===C.W3mFrameRpcConstants.ACCOUNT_TYPES.SMART_ACCOUNT}});return}},hasInsufficientToken:(e,t)=>P.isInsufficientSourceTokenForSwap(e,t,W.myTokensWithBalance),setTransactionDetails(){let{toTokenAddress:e,toTokenDecimals:t}=U.getParams();e&&t&&(W.gasPriceInUSD=P.getGasPriceInUSD(W.networkPrice,BigInt(W.gasFee),BigInt(15e4)),W.priceImpact=P.getPriceImpact({sourceTokenAmount:W.sourceTokenAmount,sourceTokenPriceInUSD:W.sourceTokenPriceInUSD,toTokenPriceInUSD:W.toTokenPriceInUSD,toTokenAmount:W.toTokenAmount}),W.maxSlippage=P.getMaxSlippage(W.slippage,W.toTokenAmount),W.providerFee=P.getProviderFee(W.sourceTokenAmount))}},U=(0,$.withErrorBoundary)(O);var D=e.i(639403);e.i(404041);var B=e.i(112699),z=e.i(645975),F=e.i(459088),L=e.i(162611),j=t;let M=L.css`
  :host {
    display: block;
    border-radius: clamp(0px, ${({borderRadius:e})=>e["8"]}, 44px);
    box-shadow: 0 0 0 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    overflow: hidden;
  }
`,H=class extends j.LitElement{render(){return o.html`<slot></slot>`}};H.styles=[F.resetStyles,M],H=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n}([(0,z.customElement)("wui-card")],H),e.i(62238);var V=t,_=t;e.i(852634),e.i(839009),e.i(73944);let K=L.css`
  :host {
    width: 100%;
  }

  :host > wui-flex {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[6]};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
    box-sizing: border-box;
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow: 0px 0px 16px 0px rgba(0, 0, 0, 0.25);
    color: ${({tokens:e})=>e.theme.textPrimary};
  }

  :host > wui-flex[data-type='info'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};

      wui-icon {
        color: ${({tokens:e})=>e.theme.iconDefault};
      }
    }
  }
  :host > wui-flex[data-type='success'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderSuccess};
      }
    }
  }
  :host > wui-flex[data-type='warning'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundWarning};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderWarning};
      }
    }
  }
  :host > wui-flex[data-type='error'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundError};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderError};
      }
    }
  }

  wui-flex {
    width: 100%;
  }

  wui-text {
    word-break: break-word;
    flex: 1;
  }

  .close {
    cursor: pointer;
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  .icon-box {
    height: 40px;
    width: 40px;
    border-radius: ${({borderRadius:e})=>e["2"]};
    background-color: var(--local-icon-bg-value);
  }
`;var G=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let Y={info:"info",success:"checkmark",warning:"warningCircle",error:"warning"},X=class extends _.LitElement{constructor(){super(...arguments),this.message="",this.type="info"}render(){return o.html`
      <wui-flex
        data-type=${(0,a.ifDefined)(this.type)}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        gap="2"
      >
        <wui-flex columnGap="2" flexDirection="row" alignItems="center">
          <wui-flex
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            class="icon-box"
          >
            <wui-icon color="inherit" size="md" name=${Y[this.type]}></wui-icon>
          </wui-flex>
          <wui-text variant="md-medium" color="inherit" data-testid="wui-alertbar-text"
            >${this.message}</wui-text
          >
        </wui-flex>
        <wui-icon
          class="close"
          color="inherit"
          size="sm"
          name="close"
          @click=${this.onClose}
        ></wui-icon>
      </wui-flex>
    `}onClose(){E.AlertController.close()}};X.styles=[F.resetStyles,K],G([(0,r.property)()],X.prototype,"message",void 0),G([(0,r.property)()],X.prototype,"type",void 0),X=G([(0,z.customElement)("wui-alertbar")],X);let q=L.css`
  :host {
    display: block;
    position: absolute;
    top: ${({spacing:e})=>e["3"]};
    left: ${({spacing:e})=>e["4"]};
    right: ${({spacing:e})=>e["4"]};
    opacity: 0;
    pointer-events: none;
  }
`;var Q=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let Z={info:{backgroundColor:"fg-350",iconColor:"fg-325",icon:"info"},success:{backgroundColor:"success-glass-reown-020",iconColor:"success-125",icon:"checkmark"},warning:{backgroundColor:"warning-glass-reown-020",iconColor:"warning-100",icon:"warningCircle"},error:{backgroundColor:"error-glass-reown-020",iconColor:"error-125",icon:"warning"}},J=class extends V.LitElement{constructor(){super(),this.unsubscribe=[],this.open=E.AlertController.state.open,this.onOpen(!0),this.unsubscribe.push(E.AlertController.subscribeKey("open",e=>{this.open=e,this.onOpen(!1)}))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){let{message:e,variant:t}=E.AlertController.state,r=Z[t];return o.html`
      <wui-alertbar
        message=${e}
        backgroundColor=${r?.backgroundColor}
        iconColor=${r?.iconColor}
        icon=${r?.icon}
        type=${t}
      ></wui-alertbar>
    `}onOpen(e){this.open?(this.animate([{opacity:0,transform:"scale(0.85)"},{opacity:1,transform:"scale(1)"}],{duration:150,fill:"forwards",easing:"ease"}),this.style.cssText="pointer-events: auto"):e||(this.animate([{opacity:1,transform:"scale(1)"},{opacity:0,transform:"scale(0.85)"}],{duration:150,fill:"forwards",easing:"ease"}),this.style.cssText="pointer-events: none")}};J.styles=q,Q([(0,i.state)()],J.prototype,"open",void 0),J=Q([(0,z.customElement)("w3m-alertbar")],J);var ee=t,et=e.i(241845),eo=e.i(436220),er=t;let ei=L.css`
  :host {
    position: relative;
  }

  button {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: transparent;
    padding: ${({spacing:e})=>e[1]};
  }

  /* -- Colors --------------------------------------------------- */
  button[data-type='accent'] wui-icon {
    color: ${({tokens:e})=>e.core.iconAccentPrimary};
  }

  button[data-type='neutral'][data-variant='primary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconInverse};
  }

  button[data-type='neutral'][data-variant='secondary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  button[data-type='success'] wui-icon {
    color: ${({tokens:e})=>e.core.iconSuccess};
  }

  button[data-type='error'] wui-icon {
    color: ${({tokens:e})=>e.core.iconError};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='xs'] {
    width: 16px;
    height: 16px;

    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='sm'] {
    width: 20px;
    height: 20px;
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='md'] {
    width: 24px;
    height: 24px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='lg'] {
    width: 28px;
    height: 28px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='xs'] wui-icon {
    width: 8px;
    height: 8px;
  }

  button[data-size='sm'] wui-icon {
    width: 12px;
    height: 12px;
  }

  button[data-size='md'] wui-icon {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] wui-icon {
    width: 20px;
    height: 20px;
  }

  /* -- Hover --------------------------------------------------- */
  @media (hover: hover) {
    button[data-type='accent']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    }

    button[data-variant='primary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-variant='secondary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-type='success']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};
    }

    button[data-type='error']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundError};
    }
  }

  /* -- Focus --------------------------------------------------- */
  button:focus-visible {
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent020};
  }

  /* -- Properties --------------------------------------------------- */
  button[data-full-width='true'] {
    width: 100%;
  }

  :host([fullWidth]) {
    width: 100%;
  }

  button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;var ea=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let en=class extends er.LitElement{constructor(){super(...arguments),this.icon="card",this.variant="primary",this.type="accent",this.size="md",this.iconSize=void 0,this.fullWidth=!1,this.disabled=!1}render(){return o.html`<button
      data-variant=${this.variant}
      data-type=${this.type}
      data-size=${this.size}
      data-full-width=${this.fullWidth}
      ?disabled=${this.disabled}
    >
      <wui-icon color="inherit" name=${this.icon} size=${(0,a.ifDefined)(this.iconSize)}></wui-icon>
    </button>`}};en.styles=[F.resetStyles,F.elementStyles,ei],ea([(0,r.property)()],en.prototype,"icon",void 0),ea([(0,r.property)()],en.prototype,"variant",void 0),ea([(0,r.property)()],en.prototype,"type",void 0),ea([(0,r.property)()],en.prototype,"size",void 0),ea([(0,r.property)()],en.prototype,"iconSize",void 0),ea([(0,r.property)({type:Boolean})],en.prototype,"fullWidth",void 0),ea([(0,r.property)({type:Boolean})],en.prototype,"disabled",void 0),en=ea([(0,z.customElement)("wui-icon-button")],en);var es=t;e.i(864380);let el=L.css`
  button {
    display: block;
    display: flex;
    align-items: center;
    padding: ${({spacing:e})=>e[1]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
    border-radius: ${({borderRadius:e})=>e[32]};
  }

  wui-image {
    border-radius: 100%;
  }

  wui-text {
    padding-left: ${({spacing:e})=>e[1]};
  }

  .left-icon-container,
  .right-icon-container {
    width: 24px;
    height: 24px;
    justify-content: center;
    align-items: center;
  }

  wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='lg'] {
    height: 32px;
  }

  button[data-size='md'] {
    height: 28px;
  }

  button[data-size='sm'] {
    height: 24px;
  }

  button[data-size='lg'] wui-image {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] wui-image {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] wui-image {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] .left-icon-container {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] .left-icon-container {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] .left-icon-container {
    width: 16px;
    height: 16px;
  }

  /* -- Variants --------------------------------------------------------- */
  button[data-type='filled-dropdown'] {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  button[data-type='text-dropdown'] {
    background-color: transparent;
  }

  /* -- Focus states --------------------------------------------------- */
  button:focus-visible:enabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent040};
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled,
    button:active:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  /* -- Disabled states --------------------------------------------------- */
  button:disabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    opacity: 0.5;
  }
`;var ec=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let ed={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},eu={lg:"lg",md:"md",sm:"sm"},ep=class extends es.LitElement{constructor(){super(...arguments),this.imageSrc="",this.text="",this.size="lg",this.type="text-dropdown",this.disabled=!1}render(){return o.html`<button ?disabled=${this.disabled} data-size=${this.size} data-type=${this.type}>
      ${this.imageTemplate()} ${this.textTemplate()}
      <wui-flex class="right-icon-container">
        <wui-icon name="chevronBottom"></wui-icon>
      </wui-flex>
    </button>`}textTemplate(){let e=ed[this.size];return this.text?o.html`<wui-text color="primary" variant=${e}>${this.text}</wui-text>`:null}imageTemplate(){if(this.imageSrc)return o.html`<wui-image src=${this.imageSrc} alt="select visual"></wui-image>`;let e=eu[this.size];return o.html` <wui-flex class="left-icon-container">
      <wui-icon size=${e} name="networkPlaceholder"></wui-icon>
    </wui-flex>`}};ep.styles=[F.resetStyles,F.elementStyles,el],ec([(0,r.property)()],ep.prototype,"imageSrc",void 0),ec([(0,r.property)()],ep.prototype,"text",void 0),ec([(0,r.property)()],ep.prototype,"size",void 0),ec([(0,r.property)()],ep.prototype,"type",void 0),ec([(0,r.property)({type:Boolean})],ep.prototype,"disabled",void 0),ep=ec([(0,z.customElement)("wui-select")],ep),e.i(630352),e.i(249536);var em=e.i(542904);let eh=L.css`
  :host {
    height: 60px;
  }

  :host > wui-flex {
    box-sizing: border-box;
    background-color: var(--local-header-background-color);
  }

  wui-text {
    background-color: var(--local-header-background-color);
  }

  wui-flex.w3m-header-title {
    transform: translateY(0);
    opacity: 1;
  }

  wui-flex.w3m-header-title[view-direction='prev'] {
    animation:
      slide-down-out 120ms forwards ${({easings:e})=>e["ease-out-power-2"]},
      slide-down-in 120ms forwards ${({easings:e})=>e["ease-out-power-2"]};
    animation-delay: 0ms, 200ms;
  }

  wui-flex.w3m-header-title[view-direction='next'] {
    animation:
      slide-up-out 120ms forwards ${({easings:e})=>e["ease-out-power-2"]},
      slide-up-in 120ms forwards ${({easings:e})=>e["ease-out-power-2"]};
    animation-delay: 0ms, 200ms;
  }

  wui-icon-button[data-hidden='true'] {
    opacity: 0 !important;
    pointer-events: none;
  }

  @keyframes slide-up-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(3px);
      opacity: 0;
    }
  }

  @keyframes slide-up-in {
    from {
      transform: translateY(-3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slide-down-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(-3px);
      opacity: 0;
    }
  }

  @keyframes slide-down-in {
    from {
      transform: translateY(3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;var ew=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let eg=["SmartSessionList"],ev={PayWithExchange:L.vars.tokens.theme.foregroundPrimary};function ef(){let e=h.RouterController.state.data?.connector?.name,t=h.RouterController.state.data?.wallet?.name,o=h.RouterController.state.data?.network?.name,r=t??e,i=d.ConnectorController.getConnectors(),a=1===i.length&&i[0]?.id==="w3m-email",n=c.ChainController.getAccountData()?.socialProvider;return{Connect:`Connect ${a?"Email":""} Wallet`,Create:"Create Wallet",ChooseAccountName:void 0,Account:void 0,AccountSettings:void 0,AllWallets:"All Wallets",ApproveTransaction:"Approve Transaction",BuyInProgress:"Buy",ConnectingExternal:r??"Connect Wallet",ConnectingWalletConnect:r??"WalletConnect",ConnectingWalletConnectBasic:"WalletConnect",ConnectingSiwe:"Sign In",Convert:"Convert",ConvertSelectToken:"Select token",ConvertPreview:"Preview Convert",Downloads:r?`Get ${r}`:"Downloads",EmailLogin:"Email Login",EmailVerifyOtp:"Confirm Email",EmailVerifyDevice:"Register Device",GetWallet:"Get a Wallet",Networks:"Choose Network",OnRampProviders:"Choose Provider",OnRampActivity:"Activity",OnRampTokenSelect:"Select Token",OnRampFiatSelect:"Select Currency",Pay:"How you pay",ProfileWallets:"Wallets",SwitchNetwork:o??"Switch Network",Transactions:"Activity",UnsupportedChain:"Switch Network",UpgradeEmailWallet:"Upgrade Your Wallet",UpdateEmailWallet:"Edit Email",UpdateEmailPrimaryOtp:"Confirm Current Email",UpdateEmailSecondaryOtp:"Confirm New Email",WhatIsABuy:"What is Buy?",RegisterAccountName:"Choose Name",RegisterAccountNameSuccess:"",WalletReceive:"Receive",WalletCompatibleNetworks:"Compatible Networks",Swap:"Swap",SwapSelectToken:"Select Token",SwapPreview:"Preview Swap",WalletSend:"Send",WalletSendPreview:"Review Send",WalletSendSelectToken:"Select Token",WalletSendConfirmed:"Confirmed",WhatIsANetwork:"What is a network?",WhatIsAWallet:"What is a Wallet?",ConnectWallets:"Connect Wallet",ConnectSocials:"All Socials",ConnectingSocial:n?n.charAt(0).toUpperCase()+n.slice(1):"Connect Social",ConnectingMultiChain:"Select Chain",ConnectingFarcaster:"Farcaster",SwitchActiveChain:"Switch Chain",SmartSessionCreated:void 0,SmartSessionList:"Smart Sessions",SIWXSignMessage:"Sign In",PayLoading:"Payment in Progress",DataCapture:"Profile",DataCaptureOtpConfirm:"Confirm Email",FundWallet:"Fund Wallet",PayWithExchange:"Deposit from Exchange",PayWithExchangeSelectAsset:"Select Asset"}}let eb=class extends ee.LitElement{constructor(){super(),this.unsubscribe=[],this.heading=ef()[h.RouterController.state.view],this.network=c.ChainController.state.activeCaipNetwork,this.networkImage=eo.AssetUtil.getNetworkImage(this.network),this.showBack=!1,this.prevHistoryLength=1,this.view=h.RouterController.state.view,this.viewDirection="",this.unsubscribe.push(et.AssetController.subscribeNetworkImages(()=>{this.networkImage=eo.AssetUtil.getNetworkImage(this.network)}),h.RouterController.subscribeKey("view",e=>{setTimeout(()=>{this.view=e,this.heading=ef()[e]},em.ConstantsUtil.ANIMATION_DURATIONS.HeaderText),this.onViewChange(),this.onHistoryChange()}),c.ChainController.subscribeKey("activeCaipNetwork",e=>{this.network=e,this.networkImage=eo.AssetUtil.getNetworkImage(this.network)}))}disconnectCallback(){this.unsubscribe.forEach(e=>e())}render(){let e=ev[h.RouterController.state.view]??L.vars.tokens.theme.backgroundPrimary;return this.style.setProperty("--local-header-background-color",e),o.html`
      <wui-flex
        .padding=${["0","4","0","4"]}
        justifyContent="space-between"
        alignItems="center"
      >
        ${this.leftHeaderTemplate()} ${this.titleTemplate()} ${this.rightHeaderTemplate()}
      </wui-flex>
    `}onWalletHelp(){I.EventsController.sendEvent({type:"track",event:"CLICK_WALLET_HELP"}),h.RouterController.push("WhatIsAWallet")}async onClose(){await g.safeClose()}rightHeaderTemplate(){let e=v.OptionsController?.state?.features?.smartSessions;return"Account"===h.RouterController.state.view&&e?o.html`<wui-flex>
      <wui-icon-button
        icon="clock"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${()=>h.RouterController.push("SmartSessionList")}
        data-testid="w3m-header-smart-sessions"
      ></wui-icon-button>
      ${this.closeButtonTemplate()}
    </wui-flex> `:this.closeButtonTemplate()}closeButtonTemplate(){return o.html`
      <wui-icon-button
        icon="close"
        size="lg"
        type="neutral"
        variant="primary"
        iconSize="lg"
        @click=${this.onClose.bind(this)}
        data-testid="w3m-header-close"
      ></wui-icon-button>
    `}titleTemplate(){let e=eg.includes(this.view);return o.html`
      <wui-flex
        view-direction="${this.viewDirection}"
        class="w3m-header-title"
        alignItems="center"
        gap="2"
      >
        <wui-text
          display="inline"
          variant="lg-regular"
          color="primary"
          data-testid="w3m-header-text"
        >
          ${this.heading}
        </wui-text>
        ${e?o.html`<wui-tag variant="accent" size="md">Beta</wui-tag>`:null}
      </wui-flex>
    `}leftHeaderTemplate(){let{view:e}=h.RouterController.state,t="Connect"===e,r=v.OptionsController.state.enableEmbedded,i=v.OptionsController.state.enableNetworkSwitch;return"Account"===e&&i?o.html`<wui-select
        id="dynamic"
        data-testid="w3m-account-select-network"
        active-network=${(0,a.ifDefined)(this.network?.name)}
        @click=${this.onNetworks.bind(this)}
        imageSrc=${(0,a.ifDefined)(this.networkImage)}
      ></wui-select>`:this.showBack&&!("ApproveTransaction"===e||"ConnectingSiwe"===e||t&&r)?o.html`<wui-icon-button
        data-testid="header-back"
        id="dynamic"
        icon="chevronLeft"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${this.onGoBack.bind(this)}
      ></wui-icon-button>`:o.html`<wui-icon-button
      data-hidden=${!t}
      id="dynamic"
      icon="helpCircle"
      size="lg"
      iconSize="lg"
      type="neutral"
      variant="primary"
      @click=${this.onWalletHelp.bind(this)}
    ></wui-icon-button>`}onNetworks(){this.isAllowedNetworkSwitch()&&(I.EventsController.sendEvent({type:"track",event:"CLICK_NETWORKS"}),h.RouterController.push("Networks"))}isAllowedNetworkSwitch(){let e=c.ChainController.getAllRequestedCaipNetworks(),t=!!e&&e.length>1,o=e?.find(({id:e})=>e===this.network?.id);return t||!o}onViewChange(){let{history:e}=h.RouterController.state,t=em.ConstantsUtil.VIEW_DIRECTION.Next;e.length<this.prevHistoryLength&&(t=em.ConstantsUtil.VIEW_DIRECTION.Prev),this.prevHistoryLength=e.length,this.viewDirection=t}async onHistoryChange(){let{history:e}=h.RouterController.state,t=this.shadowRoot?.querySelector("#dynamic");e.length>1&&!this.showBack&&t?(await t.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.showBack=!0,t.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"})):e.length<=1&&this.showBack&&t&&(await t.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.showBack=!1,t.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}onGoBack(){h.RouterController.goBack()}};eb.styles=eh,ew([(0,i.state)()],eb.prototype,"heading",void 0),ew([(0,i.state)()],eb.prototype,"network",void 0),ew([(0,i.state)()],eb.prototype,"networkImage",void 0),ew([(0,i.state)()],eb.prototype,"showBack",void 0),ew([(0,i.state)()],eb.prototype,"prevHistoryLength",void 0),ew([(0,i.state)()],eb.prototype,"view",void 0),ew([(0,i.state)()],eb.prototype,"viewDirection",void 0),eb=ew([(0,z.customElement)("w3m-header")],eb);var ey=t,ek=t;e.i(383227),e.i(912190);let eC=L.css`
  :host {
    display: flex;
    align-items: center;
    gap: ${({spacing:e})=>e[1]};
    padding: ${({spacing:e})=>e[2]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[2]} ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[20]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow:
      0px 0px 8px 0px rgba(0, 0, 0, 0.1),
      inset 0 0 0 1px ${({tokens:e})=>e.theme.borderPrimary};
    max-width: 320px;
  }

  wui-icon-box {
    border-radius: ${({borderRadius:e})=>e.round} !important;
    overflow: hidden;
  }

  wui-loading-spinner {
    padding: ${({spacing:e})=>e[1]};
    background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    border-radius: ${({borderRadius:e})=>e.round} !important;
  }
`;var ex=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let eT=class extends ek.LitElement{constructor(){super(...arguments),this.message="",this.variant="success"}render(){return o.html`
      ${this.templateIcon()}
      <wui-text variant="lg-regular" color="primary" data-testid="wui-snackbar-message"
        >${this.message}</wui-text
      >
    `}templateIcon(){return"loading"===this.variant?o.html`<wui-loading-spinner size="md" color="accent-primary"></wui-loading-spinner>`:o.html`<wui-icon-box
      size="md"
      color=${({success:"success",error:"error",warning:"warning",info:"default"})[this.variant]}
      icon=${({success:"checkmark",error:"warning",warning:"warningCircle",info:"info"})[this.variant]}
    ></wui-icon-box>`}};eT.styles=[F.resetStyles,eC],ex([(0,r.property)()],eT.prototype,"message",void 0),ex([(0,r.property)()],eT.prototype,"variant",void 0),eT=ex([(0,z.customElement)("wui-snackbar")],eT);var eS=e.i(592057);let eA=eS.css`
  :host {
    display: block;
    position: absolute;
    opacity: 0;
    pointer-events: none;
    top: 11px;
    left: 50%;
    width: max-content;
  }
`;var eP=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let e$=class extends ey.LitElement{constructor(){super(),this.unsubscribe=[],this.timeout=void 0,this.open=f.SnackController.state.open,this.unsubscribe.push(f.SnackController.subscribeKey("open",e=>{this.open=e,this.onOpen()}))}disconnectedCallback(){clearTimeout(this.timeout),this.unsubscribe.forEach(e=>e())}render(){let{message:e,variant:t}=f.SnackController.state;return o.html` <wui-snackbar message=${e} variant=${t}></wui-snackbar> `}onOpen(){clearTimeout(this.timeout),this.open?(this.animate([{opacity:0,transform:"translateX(-50%) scale(0.85)"},{opacity:1,transform:"translateX(-50%) scale(1)"}],{duration:150,fill:"forwards",easing:"ease"}),this.timeout&&clearTimeout(this.timeout),f.SnackController.state.autoClose&&(this.timeout=setTimeout(()=>f.SnackController.hide(),2500))):this.animate([{opacity:1,transform:"translateX(-50%) scale(1)"},{opacity:0,transform:"translateX(-50%) scale(0.85)"}],{duration:150,fill:"forwards",easing:"ease"})}};e$.styles=eA,eP([(0,i.state)()],e$.prototype,"open",void 0),e$=eP([(0,z.customElement)("w3m-snackbar")],e$);var eE=t;let eR=(0,b.proxy)({message:"",open:!1,triggerRect:{width:0,height:0,top:0,left:0},variant:"shade"}),eI=(0,$.withErrorBoundary)({state:eR,subscribe:e=>(0,b.subscribe)(eR,()=>e(eR)),subscribeKey:(e,t)=>(0,y.subscribeKey)(eR,e,t),showTooltip({message:e,triggerRect:t,variant:o}){eR.open=!0,eR.message=e,eR.triggerRect=t,eR.variant=o},hide(){eR.open=!1,eR.message="",eR.triggerRect={width:0,height:0,top:0,left:0}}});e.i(443452);let eN=L.css`
  :host {
    pointer-events: none;
  }

  :host > wui-flex {
    display: var(--w3m-tooltip-display);
    opacity: var(--w3m-tooltip-opacity);
    padding: 9px ${({spacing:e})=>e["3"]} 10px ${({spacing:e})=>e["3"]};
    border-radius: ${({borderRadius:e})=>e["3"]};
    color: ${({tokens:e})=>e.theme.backgroundPrimary};
    position: absolute;
    top: var(--w3m-tooltip-top);
    left: var(--w3m-tooltip-left);
    transform: translate(calc(-50% + var(--w3m-tooltip-parent-width)), calc(-100% - 8px));
    max-width: calc(var(--apkt-modal-width) - ${({spacing:e})=>e["5"]});
    transition: opacity ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity;
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  :host([data-variant='shade']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  :host([data-variant='shade']) > wui-flex > wui-text {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  :host([data-variant='fill']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.textPrimary};
    border: none;
  }

  wui-icon {
    position: absolute;
    width: 12px !important;
    height: 4px !important;
    color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  wui-icon[data-placement='top'] {
    bottom: 0px;
    left: 50%;
    transform: translate(-50%, 95%);
  }

  wui-icon[data-placement='bottom'] {
    top: 0;
    left: 50%;
    transform: translate(-50%, -95%) rotate(180deg);
  }

  wui-icon[data-placement='right'] {
    top: 50%;
    left: 0;
    transform: translate(-65%, -50%) rotate(90deg);
  }

  wui-icon[data-placement='left'] {
    top: 50%;
    right: 0%;
    transform: translate(65%, -50%) rotate(270deg);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var eW=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let eO=class extends eE.LitElement{constructor(){super(),this.unsubscribe=[],this.open=eI.state.open,this.message=eI.state.message,this.triggerRect=eI.state.triggerRect,this.variant=eI.state.variant,this.unsubscribe.push(eI.subscribe(e=>{this.open=e.open,this.message=e.message,this.triggerRect=e.triggerRect,this.variant=e.variant}))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){this.dataset.variant=this.variant;let e=this.triggerRect.top,t=this.triggerRect.left;return this.style.cssText=`
    --w3m-tooltip-top: ${e}px;
    --w3m-tooltip-left: ${t}px;
    --w3m-tooltip-parent-width: ${this.triggerRect.width/2}px;
    --w3m-tooltip-display: ${this.open?"flex":"none"};
    --w3m-tooltip-opacity: ${+!!this.open};
    `,o.html`<wui-flex>
      <wui-icon data-placement="top" size="inherit" name="cursor"></wui-icon>
      <wui-text color="primary" variant="sm-regular">${this.message}</wui-text>
    </wui-flex>`}};eO.styles=[eN],eW([(0,i.state)()],eO.prototype,"open",void 0),eW([(0,i.state)()],eO.prototype,"message",void 0),eW([(0,i.state)()],eO.prototype,"triggerRect",void 0),eW([(0,i.state)()],eO.prototype,"variant",void 0),eO=eW([(0,z.customElement)("w3m-tooltip")],eO);let eU={getTabsByNamespace:e=>e&&e===n.ConstantsUtil.CHAIN.EVM?v.OptionsController.state.remoteFeatures?.activity===!1?em.ConstantsUtil.ACCOUNT_TABS.filter(e=>"Activity"!==e.label):em.ConstantsUtil.ACCOUNT_TABS:[],isValidReownName:e=>/^[a-zA-Z0-9]+$/gu.test(e),isValidEmail:e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/gu.test(e),validateReownName:e=>e.replace(/\^/gu,"").toLowerCase().replace(/[^a-zA-Z0-9]/gu,""),hasFooter(){let e=h.RouterController.state.view;if(em.ConstantsUtil.VIEWS_WITH_LEGAL_FOOTER.includes(e)){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.OptionsController.state,o=v.OptionsController.state.features?.legalCheckbox;return(!!e||!!t)&&!o}return em.ConstantsUtil.VIEWS_WITH_DEFAULT_FOOTER.includes(e)}};var eD=t,eB=t;e.i(803596);let ez=L.css`
  :host wui-ux-by-reown {
    padding-top: 0;
  }

  :host wui-ux-by-reown.branding-only {
    padding-top: ${({spacing:e})=>e["3"]};
  }

  a {
    text-decoration: none;
    color: ${({tokens:e})=>e.core.textAccentPrimary};
    font-weight: 500;
  }
`;var eF=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let eL=class extends eB.LitElement{constructor(){super(),this.unsubscribe=[],this.remoteFeatures=v.OptionsController.state.remoteFeatures,this.unsubscribe.push(v.OptionsController.subscribeKey("remoteFeatures",e=>this.remoteFeatures=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.OptionsController.state,r=v.OptionsController.state.features?.legalCheckbox;return(e||t)&&!r?o.html`
      <wui-flex flexDirection="column">
        <wui-flex .padding=${["4","3","3","3"]} justifyContent="center">
          <wui-text color="secondary" variant="md-regular" align="center">
            By connecting your wallet, you agree to our <br />
            ${this.termsTemplate()} ${this.andTemplate()} ${this.privacyTemplate()}
          </wui-text>
        </wui-flex>
        ${this.reownBrandingTemplate()}
      </wui-flex>
    `:o.html`
        <wui-flex flexDirection="column"> ${this.reownBrandingTemplate(!0)} </wui-flex>
      `}andTemplate(){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.OptionsController.state;return e&&t?"and":""}termsTemplate(){let{termsConditionsUrl:e}=v.OptionsController.state;return e?o.html`<a href=${e} target="_blank" rel="noopener noreferrer"
      >Terms of Service</a
    >`:null}privacyTemplate(){let{privacyPolicyUrl:e}=v.OptionsController.state;return e?o.html`<a href=${e} target="_blank" rel="noopener noreferrer"
      >Privacy Policy</a
    >`:null}reownBrandingTemplate(e=!1){return this.remoteFeatures?.reownBranding?e?o.html`<wui-ux-by-reown class="branding-only"></wui-ux-by-reown>`:o.html`<wui-ux-by-reown></wui-ux-by-reown>`:null}};eL.styles=[ez],eF([(0,i.state)()],eL.prototype,"remoteFeatures",void 0),eL=eF([(0,z.customElement)("w3m-legal-footer")],eL);var ej=t;e.i(210380);let eM=eS.css``,eH=class extends ej.LitElement{render(){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.OptionsController.state;return e||t?o.html`
      <wui-flex
        .padding=${["4","3","3","3"]}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="3"
      >
        <wui-text color="secondary" variant="md-regular" align="center">
          We work with the best providers to give you the lowest fees and best support. More options
          coming soon!
        </wui-text>

        ${this.howDoesItWorkTemplate()}
      </wui-flex>
    `:null}howDoesItWorkTemplate(){return o.html` <wui-link @click=${this.onWhatIsBuy.bind(this)}>
      <wui-icon size="xs" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
      How does it work?
    </wui-link>`}onWhatIsBuy(){I.EventsController.sendEvent({type:"track",event:"SELECT_WHAT_IS_A_BUY",properties:{isSmartAccount:(0,T.getPreferredAccountType)(c.ChainController.state.activeChain)===C.W3mFrameRpcConstants.ACCOUNT_TYPES.SMART_ACCOUNT}}),h.RouterController.push("WhatIsABuy")}};eH.styles=[eM],eH=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n}([(0,z.customElement)("w3m-onramp-providers-footer")],eH);let eV=L.css`
  :host {
    display: block;
  }

  div.container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    overflow: hidden;
    height: auto;
    display: block;
  }

  div.container[status='hide'] {
    animation: fade-out;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: both;
    animation-delay: 0s;
  }

  div.container[status='show'] {
    animation: fade-in;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      filter: blur(6px);
    }
    to {
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes fade-out {
    from {
      opacity: 1;
      filter: blur(0px);
    }
    to {
      opacity: 0;
      filter: blur(6px);
    }
  }
`;var e_=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let eK=class extends eD.LitElement{constructor(){super(...arguments),this.resizeObserver=void 0,this.unsubscribe=[],this.status="hide",this.view=h.RouterController.state.view}firstUpdated(){this.status=eU.hasFooter()?"show":"hide",this.unsubscribe.push(h.RouterController.subscribeKey("view",e=>{this.view=e,this.status=eU.hasFooter()?"show":"hide","hide"===this.status&&document.documentElement.style.setProperty("--apkt-footer-height","0px")})),this.resizeObserver=new ResizeObserver(e=>{for(let t of e)if(t.target===this.getWrapper()){let e=`${t.contentRect.height}px`;document.documentElement.style.setProperty("--apkt-footer-height",e)}}),this.resizeObserver.observe(this.getWrapper())}render(){return o.html`
      <div class="container" status=${this.status}>${this.templatePageContainer()}</div>
    `}templatePageContainer(){return eU.hasFooter()?o.html` ${this.templateFooter()}`:null}templateFooter(){switch(this.view){case"Networks":return this.templateNetworksFooter();case"Connect":case"ConnectWallets":case"OnRampFiatSelect":case"OnRampTokenSelect":return o.html`<w3m-legal-footer></w3m-legal-footer>`;case"OnRampProviders":return o.html`<w3m-onramp-providers-footer></w3m-onramp-providers-footer>`;default:return null}}templateNetworksFooter(){return o.html` <wui-flex
      class="footer-in"
      padding="3"
      flexDirection="column"
      gap="3"
      alignItems="center"
    >
      <wui-text variant="md-regular" color="secondary" align="center">
        Your connected wallet may not support some of the networks available for this dApp
      </wui-text>
      <wui-link @click=${this.onNetworkHelp.bind(this)}>
        <wui-icon size="sm" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
        What is a network
      </wui-link>
    </wui-flex>`}onNetworkHelp(){I.EventsController.sendEvent({type:"track",event:"CLICK_NETWORK_HELP"}),h.RouterController.push("WhatIsANetwork")}getWrapper(){return this.shadowRoot?.querySelector("div.container")}};eK.styles=[eV],e_([(0,i.state)()],eK.prototype,"status",void 0),e_([(0,i.state)()],eK.prototype,"view",void 0),eK=e_([(0,z.customElement)("w3m-footer")],eK);var eG=t;let eY=L.css`
  :host {
    display: block;
    width: inherit;
  }
`;var eX=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let eq=class extends eG.LitElement{constructor(){super(),this.unsubscribe=[],this.viewState=h.RouterController.state.view,this.history=h.RouterController.state.history.join(","),this.unsubscribe.push(h.RouterController.subscribeKey("view",()=>{this.history=h.RouterController.state.history.join(","),document.documentElement.style.setProperty("--apkt-duration-dynamic","var(--apkt-durations-lg)")}))}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),document.documentElement.style.setProperty("--apkt-duration-dynamic","0s")}render(){return o.html`${this.templatePageContainer()}`}templatePageContainer(){return o.html`<w3m-router-container
      history=${this.history}
      .setView=${()=>{this.viewState=h.RouterController.state.view}}
    >
      ${this.viewTemplate(this.viewState)}
    </w3m-router-container>`}viewTemplate(e){switch(e){case"AccountSettings":return o.html`<w3m-account-settings-view></w3m-account-settings-view>`;case"Account":return o.html`<w3m-account-view></w3m-account-view>`;case"AllWallets":return o.html`<w3m-all-wallets-view></w3m-all-wallets-view>`;case"ApproveTransaction":return o.html`<w3m-approve-transaction-view></w3m-approve-transaction-view>`;case"BuyInProgress":return o.html`<w3m-buy-in-progress-view></w3m-buy-in-progress-view>`;case"ChooseAccountName":return o.html`<w3m-choose-account-name-view></w3m-choose-account-name-view>`;case"Connect":default:return o.html`<w3m-connect-view></w3m-connect-view>`;case"Create":return o.html`<w3m-connect-view walletGuide="explore"></w3m-connect-view>`;case"ConnectingWalletConnect":return o.html`<w3m-connecting-wc-view></w3m-connecting-wc-view>`;case"ConnectingWalletConnectBasic":return o.html`<w3m-connecting-wc-basic-view></w3m-connecting-wc-basic-view>`;case"ConnectingExternal":return o.html`<w3m-connecting-external-view></w3m-connecting-external-view>`;case"ConnectingSiwe":return o.html`<w3m-connecting-siwe-view></w3m-connecting-siwe-view>`;case"ConnectWallets":return o.html`<w3m-connect-wallets-view></w3m-connect-wallets-view>`;case"ConnectSocials":return o.html`<w3m-connect-socials-view></w3m-connect-socials-view>`;case"ConnectingSocial":return o.html`<w3m-connecting-social-view></w3m-connecting-social-view>`;case"DataCapture":return o.html`<w3m-data-capture-view></w3m-data-capture-view>`;case"DataCaptureOtpConfirm":return o.html`<w3m-data-capture-otp-confirm-view></w3m-data-capture-otp-confirm-view>`;case"Downloads":return o.html`<w3m-downloads-view></w3m-downloads-view>`;case"EmailLogin":return o.html`<w3m-email-login-view></w3m-email-login-view>`;case"EmailVerifyOtp":return o.html`<w3m-email-verify-otp-view></w3m-email-verify-otp-view>`;case"EmailVerifyDevice":return o.html`<w3m-email-verify-device-view></w3m-email-verify-device-view>`;case"GetWallet":return o.html`<w3m-get-wallet-view></w3m-get-wallet-view>`;case"Networks":return o.html`<w3m-networks-view></w3m-networks-view>`;case"SwitchNetwork":return o.html`<w3m-network-switch-view></w3m-network-switch-view>`;case"ProfileWallets":return o.html`<w3m-profile-wallets-view></w3m-profile-wallets-view>`;case"Transactions":return o.html`<w3m-transactions-view></w3m-transactions-view>`;case"OnRampProviders":return o.html`<w3m-onramp-providers-view></w3m-onramp-providers-view>`;case"OnRampTokenSelect":return o.html`<w3m-onramp-token-select-view></w3m-onramp-token-select-view>`;case"OnRampFiatSelect":return o.html`<w3m-onramp-fiat-select-view></w3m-onramp-fiat-select-view>`;case"UpgradeEmailWallet":return o.html`<w3m-upgrade-wallet-view></w3m-upgrade-wallet-view>`;case"UpdateEmailWallet":return o.html`<w3m-update-email-wallet-view></w3m-update-email-wallet-view>`;case"UpdateEmailPrimaryOtp":return o.html`<w3m-update-email-primary-otp-view></w3m-update-email-primary-otp-view>`;case"UpdateEmailSecondaryOtp":return o.html`<w3m-update-email-secondary-otp-view></w3m-update-email-secondary-otp-view>`;case"UnsupportedChain":return o.html`<w3m-unsupported-chain-view></w3m-unsupported-chain-view>`;case"Swap":return o.html`<w3m-swap-view></w3m-swap-view>`;case"SwapSelectToken":return o.html`<w3m-swap-select-token-view></w3m-swap-select-token-view>`;case"SwapPreview":return o.html`<w3m-swap-preview-view></w3m-swap-preview-view>`;case"WalletSend":return o.html`<w3m-wallet-send-view></w3m-wallet-send-view>`;case"WalletSendSelectToken":return o.html`<w3m-wallet-send-select-token-view></w3m-wallet-send-select-token-view>`;case"WalletSendPreview":return o.html`<w3m-wallet-send-preview-view></w3m-wallet-send-preview-view>`;case"WalletSendConfirmed":return o.html`<w3m-send-confirmed-view></w3m-send-confirmed-view>`;case"WhatIsABuy":return o.html`<w3m-what-is-a-buy-view></w3m-what-is-a-buy-view>`;case"WalletReceive":return o.html`<w3m-wallet-receive-view></w3m-wallet-receive-view>`;case"WalletCompatibleNetworks":return o.html`<w3m-wallet-compatible-networks-view></w3m-wallet-compatible-networks-view>`;case"WhatIsAWallet":return o.html`<w3m-what-is-a-wallet-view></w3m-what-is-a-wallet-view>`;case"ConnectingMultiChain":return o.html`<w3m-connecting-multi-chain-view></w3m-connecting-multi-chain-view>`;case"WhatIsANetwork":return o.html`<w3m-what-is-a-network-view></w3m-what-is-a-network-view>`;case"ConnectingFarcaster":return o.html`<w3m-connecting-farcaster-view></w3m-connecting-farcaster-view>`;case"SwitchActiveChain":return o.html`<w3m-switch-active-chain-view></w3m-switch-active-chain-view>`;case"RegisterAccountName":return o.html`<w3m-register-account-name-view></w3m-register-account-name-view>`;case"RegisterAccountNameSuccess":return o.html`<w3m-register-account-name-success-view></w3m-register-account-name-success-view>`;case"SmartSessionCreated":return o.html`<w3m-smart-session-created-view></w3m-smart-session-created-view>`;case"SmartSessionList":return o.html`<w3m-smart-session-list-view></w3m-smart-session-list-view>`;case"SIWXSignMessage":return o.html`<w3m-siwx-sign-message-view></w3m-siwx-sign-message-view>`;case"Pay":return o.html`<w3m-pay-view></w3m-pay-view>`;case"PayLoading":return o.html`<w3m-pay-loading-view></w3m-pay-loading-view>`;case"FundWallet":return o.html`<w3m-fund-wallet-view></w3m-fund-wallet-view>`;case"PayWithExchange":return o.html`<w3m-deposit-from-exchange-view></w3m-deposit-from-exchange-view>`;case"PayWithExchangeSelectAsset":return o.html`<w3m-deposit-from-exchange-select-asset-view></w3m-deposit-from-exchange-select-asset-view>`}}};eq.styles=[eY],eX([(0,i.state)()],eq.prototype,"viewState",void 0),eX([(0,i.state)()],eq.prototype,"history",void 0),eq=eX([(0,z.customElement)("w3m-router")],eq);let eQ=L.css`
  :host {
    z-index: ${({tokens:e})=>e.core.zIndex};
    display: block;
    backface-visibility: hidden;
    will-change: opacity;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    opacity: 0;
    background-color: ${({tokens:e})=>e.theme.overlay};
    backdrop-filter: blur(0px);
    transition:
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      backdrop-filter ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity;
  }

  :host(.open) {
    opacity: 1;
    backdrop-filter: blur(8px);
  }

  :host(.appkit-modal) {
    position: relative;
    pointer-events: unset;
    background: none;
    width: 100%;
    opacity: 1;
  }

  wui-card {
    max-width: var(--apkt-modal-width);
    width: 100%;
    position: relative;
    outline: none;
    transform: translateY(4px);
    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.05);
    transition:
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      border-radius ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]};
    will-change: border-radius, background-color, transform, box-shadow;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    padding: var(--local-modal-padding);
    box-sizing: border-box;
  }

  :host(.open) wui-card {
    transform: translateY(0px);
  }

  wui-card::before {
    z-index: 1;
    pointer-events: none;
    content: '';
    position: absolute;
    inset: 0;
    border-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    transition: box-shadow ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    transition-delay: ${({durations:e})=>e.md};
    will-change: box-shadow;
  }

  :host([data-mobile-fullscreen='true']) wui-card::before {
    border-radius: 0px;
  }

  :host([data-border='true']) wui-card::before {
    box-shadow: inset 0px 0px 0px 4px ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  :host([data-border='false']) wui-card::before {
    box-shadow: inset 0px 0px 0px 1px ${({tokens:e})=>e.theme.borderPrimaryDark};
  }

  :host([data-border='true']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      card-background-border var(--apkt-duration-dynamic)
        ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: backwards, both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  :host([data-border='false']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      card-background-default var(--apkt-duration-dynamic)
        ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: backwards, both;
    animation-delay: 0s;
  }

  :host(.appkit-modal) wui-card {
    max-width: var(--apkt-modal-width);
  }

  wui-card[shake='true'] {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      w3m-shake ${({durations:e})=>e.xl}
        ${({easings:e})=>e["ease-out-power-2"]};
  }

  wui-flex {
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  @media (max-height: 700px) and (min-width: 431px) {
    wui-flex {
      align-items: flex-start;
    }

    wui-card {
      margin: var(--apkt-spacing-6) 0px;
    }
  }

  @media (max-width: 430px) {
    :host([data-mobile-fullscreen='true']) {
      height: 100dvh;
    }
    :host([data-mobile-fullscreen='true']) wui-flex {
      align-items: stretch;
    }
    :host([data-mobile-fullscreen='true']) wui-card {
      max-width: 100%;
      height: 100%;
      border-radius: 0;
      border: none;
    }
    :host(:not([data-mobile-fullscreen='true'])) wui-flex {
      align-items: flex-end;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card {
      max-width: 100%;
      border-bottom: none;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card[data-embedded='true'] {
      border-bottom-left-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
      border-bottom-right-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card:not([data-embedded='true']) {
      border-bottom-left-radius: 0px;
      border-bottom-right-radius: 0px;
    }

    wui-card[shake='true'] {
      animation: w3m-shake 0.5s ${({easings:e})=>e["ease-out-power-2"]};
    }
  }

  @keyframes fade-in {
    0% {
      transform: scale(0.99) translateY(4px);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }

  @keyframes w3m-shake {
    0% {
      transform: scale(1) rotate(0deg);
    }
    20% {
      transform: scale(1) rotate(-1deg);
    }
    40% {
      transform: scale(1) rotate(1.5deg);
    }
    60% {
      transform: scale(1) rotate(-1.5deg);
    }
    80% {
      transform: scale(1) rotate(1deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
    }
  }

  @keyframes card-background-border {
    from {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  @keyframes card-background-default {
    from {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
  }
`;var eZ=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let eJ="scroll-lock",e0={PayWithExchange:"0",PayWithExchangeSelectAsset:"0"};class e3 extends t.LitElement{constructor(){super(),this.unsubscribe=[],this.abortController=void 0,this.hasPrefetched=!1,this.enableEmbedded=v.OptionsController.state.enableEmbedded,this.open=p.ModalController.state.open,this.caipAddress=c.ChainController.state.activeCaipAddress,this.caipNetwork=c.ChainController.state.activeCaipNetwork,this.shake=p.ModalController.state.shake,this.filterByNamespace=d.ConnectorController.state.filterByNamespace,this.padding=L.vars.spacing[1],this.mobileFullScreen=v.OptionsController.state.enableMobileFullScreen,this.initializeTheming(),l.ApiController.prefetchAnalyticsConfig(),this.unsubscribe.push(p.ModalController.subscribeKey("open",e=>e?this.onOpen():this.onClose()),p.ModalController.subscribeKey("shake",e=>this.shake=e),c.ChainController.subscribeKey("activeCaipNetwork",e=>this.onNewNetwork(e)),c.ChainController.subscribeKey("activeCaipAddress",e=>this.onNewAddress(e)),v.OptionsController.subscribeKey("enableEmbedded",e=>this.enableEmbedded=e),d.ConnectorController.subscribeKey("filterByNamespace",e=>{this.filterByNamespace===e||c.ChainController.getAccountData(e)?.caipAddress||(l.ApiController.fetchRecommendedWallets(),this.filterByNamespace=e)}),h.RouterController.subscribeKey("view",()=>{this.dataset.border=eU.hasFooter()?"true":"false",this.padding=e0[h.RouterController.state.view]??L.vars.spacing[1]}))}firstUpdated(){if(this.dataset.border=eU.hasFooter()?"true":"false",this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.caipAddress){if(this.enableEmbedded){p.ModalController.close(),this.prefetch();return}this.onNewAddress(this.caipAddress)}this.open&&this.onOpen(),this.enableEmbedded&&this.prefetch()}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),this.onRemoveKeyboardListener()}render(){return(this.style.setProperty("--local-modal-padding",this.padding),this.enableEmbedded)?o.html`${this.contentTemplate()}
        <w3m-tooltip></w3m-tooltip> `:this.open?o.html`
          <wui-flex @click=${this.onOverlayClick.bind(this)} data-testid="w3m-modal-overlay">
            ${this.contentTemplate()}
          </wui-flex>
          <w3m-tooltip></w3m-tooltip>
        `:null}contentTemplate(){return o.html` <wui-card
      shake="${this.shake}"
      data-embedded="${(0,a.ifDefined)(this.enableEmbedded)}"
      role="alertdialog"
      aria-modal="true"
      tabindex="0"
      data-testid="w3m-modal-card"
    >
      <w3m-header></w3m-header>
      <w3m-router></w3m-router>
      <w3m-footer></w3m-footer>
      <w3m-snackbar></w3m-snackbar>
      <w3m-alertbar></w3m-alertbar>
    </wui-card>`}async onOverlayClick(e){e.target===e.currentTarget&&(this.mobileFullScreen||await this.handleClose())}async handleClose(){await g.safeClose()}initializeTheming(){let{themeVariables:e,themeMode:t}=D.ThemeController.state,o=B.UiHelperUtil.getColorTheme(t);(0,F.initializeTheming)(e,o)}onClose(){this.open=!1,this.classList.remove("open"),this.onScrollUnlock(),f.SnackController.hide(),this.onRemoveKeyboardListener()}onOpen(){this.open=!0,this.classList.add("open"),this.onScrollLock(),this.onAddKeyboardListener()}onScrollLock(){let e=document.createElement("style");e.dataset.w3m=eJ,e.textContent=`
      body {
        touch-action: none;
        overflow: hidden;
        overscroll-behavior: contain;
      }
      w3m-modal {
        pointer-events: auto;
      }
    `,document.head.appendChild(e)}onScrollUnlock(){let e=document.head.querySelector(`style[data-w3m="${eJ}"]`);e&&e.remove()}onAddKeyboardListener(){this.abortController=new AbortController;let e=this.shadowRoot?.querySelector("wui-card");e?.focus(),window.addEventListener("keydown",t=>{if("Escape"===t.key)this.handleClose();else if("Tab"===t.key){let{tagName:o}=t.target;!o||o.includes("W3M-")||o.includes("WUI-")||e?.focus()}},this.abortController)}onRemoveKeyboardListener(){this.abortController?.abort(),this.abortController=void 0}async onNewAddress(e){let t=c.ChainController.state.isSwitchingNamespace,o="ProfileWallets"===h.RouterController.state.view;e?await this.onConnected({caipAddress:e,isSwitchingNamespace:t,isInProfileView:o}):t||this.enableEmbedded||o||p.ModalController.close(),await w.SIWXUtil.initializeIfEnabled(e),this.caipAddress=e,c.ChainController.setIsSwitchingNamespace(!1)}async onConnected(e){if(e.isInProfileView)return;let{chainNamespace:t,chainId:o,address:r}=s.ParseUtil.parseCaipAddress(e.caipAddress),i=`${t}:${o}`,a=!u.CoreHelperUtil.getPlainAddress(this.caipAddress),n=await w.SIWXUtil.getSessions({address:r,caipNetworkId:i}),l=!w.SIWXUtil.getSIWX()||n.some(e=>e.data.accountAddress===r),c=e.isSwitchingNamespace&&l&&!this.enableEmbedded,d=this.enableEmbedded&&a;c?h.RouterController.goBack():d&&p.ModalController.close()}onNewNetwork(e){let t=this.caipNetwork,o=t?.caipNetworkId?.toString(),r=t?.chainNamespace,i=e?.caipNetworkId?.toString(),a=e?.chainNamespace,s=o!==i,l=t?.name===n.ConstantsUtil.UNSUPPORTED_NETWORK_NAME,d="ConnectingExternal"===h.RouterController.state.view,u="ProfileWallets"===h.RouterController.state.view,m=!c.ChainController.getAccountData(e?.chainNamespace)?.caipAddress,w="UnsupportedChain"===h.RouterController.state.view,g=p.ModalController.state.open,v=!1;this.enableEmbedded&&"SwitchNetwork"===h.RouterController.state.view&&(v=!0),s&&U.resetState(),g&&!d&&!u&&(m?s&&(v=!0):w?v=!0:s&&r===a&&!l&&(v=!0)),v&&"SIWXSignMessage"!==h.RouterController.state.view&&h.RouterController.goBack(),this.caipNetwork=e}prefetch(){this.hasPrefetched||(l.ApiController.prefetch(),l.ApiController.fetchWalletsByPage({page:1}),this.hasPrefetched=!0)}}e3.styles=eQ,eZ([(0,r.property)({type:Boolean})],e3.prototype,"enableEmbedded",void 0),eZ([(0,i.state)()],e3.prototype,"open",void 0),eZ([(0,i.state)()],e3.prototype,"caipAddress",void 0),eZ([(0,i.state)()],e3.prototype,"caipNetwork",void 0),eZ([(0,i.state)()],e3.prototype,"shake",void 0),eZ([(0,i.state)()],e3.prototype,"filterByNamespace",void 0),eZ([(0,i.state)()],e3.prototype,"padding",void 0),eZ([(0,i.state)()],e3.prototype,"mobileFullScreen",void 0);let e1=class extends e3{};e1=eZ([(0,z.customElement)("w3m-modal")],e1);let e2=class extends e3{};e2=eZ([(0,z.customElement)("appkit-modal")],e2),e.s(["AppKitModal",()=>e2,"W3mModal",()=>e1,"W3mModalBase",()=>e3],839010);var e5=t;e.i(987789);let e4=L.css`
  :host {
    width: 100%;
  }
`;var e8=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let e6=class extends e5.LitElement{constructor(){super(...arguments),this.hasImpressionSent=!1,this.walletImages=[],this.imageSrc="",this.name="",this.size="md",this.tabIdx=void 0,this.disabled=!1,this.showAllWallets=!1,this.loading=!1,this.loadingSpinnerColor="accent-100",this.rdnsId="",this.displayIndex=void 0,this.walletRank=void 0}connectedCallback(){super.connectedCallback()}disconnectedCallback(){super.disconnectedCallback(),this.cleanupIntersectionObserver()}updated(e){super.updated(e),(e.has("name")||e.has("imageSrc")||e.has("walletRank"))&&(this.hasImpressionSent=!1),e.has("walletRank")&&this.walletRank&&!this.intersectionObserver&&this.setupIntersectionObserver()}setupIntersectionObserver(){this.intersectionObserver=new IntersectionObserver(e=>{e.forEach(e=>{!e.isIntersecting||this.loading||this.hasImpressionSent||this.sendImpressionEvent()})},{threshold:.1}),this.intersectionObserver.observe(this)}cleanupIntersectionObserver(){this.intersectionObserver&&(this.intersectionObserver.disconnect(),this.intersectionObserver=void 0)}sendImpressionEvent(){this.name&&!this.hasImpressionSent&&this.walletRank&&(this.hasImpressionSent=!0,(this.rdnsId||this.name)&&I.EventsController.sendWalletImpressionEvent({name:this.name,walletRank:this.walletRank,rdnsId:this.rdnsId,view:h.RouterController.state.view,displayIndex:this.displayIndex}))}render(){return o.html`
      <wui-list-wallet
        .walletImages=${this.walletImages}
        imageSrc=${(0,a.ifDefined)(this.imageSrc)}
        name=${this.name}
        size=${(0,a.ifDefined)(this.size)}
        tagLabel=${(0,a.ifDefined)(this.tagLabel)}
        .tagVariant=${this.tagVariant}
        .walletIcon=${this.walletIcon}
        .tabIdx=${this.tabIdx}
        .disabled=${this.disabled}
        .showAllWallets=${this.showAllWallets}
        .loading=${this.loading}
        loadingSpinnerColor=${this.loadingSpinnerColor}
      ></wui-list-wallet>
    `}};e6.styles=e4,e8([(0,r.property)({type:Array})],e6.prototype,"walletImages",void 0),e8([(0,r.property)()],e6.prototype,"imageSrc",void 0),e8([(0,r.property)()],e6.prototype,"name",void 0),e8([(0,r.property)()],e6.prototype,"size",void 0),e8([(0,r.property)()],e6.prototype,"tagLabel",void 0),e8([(0,r.property)()],e6.prototype,"tagVariant",void 0),e8([(0,r.property)()],e6.prototype,"walletIcon",void 0),e8([(0,r.property)()],e6.prototype,"tabIdx",void 0),e8([(0,r.property)({type:Boolean})],e6.prototype,"disabled",void 0),e8([(0,r.property)({type:Boolean})],e6.prototype,"showAllWallets",void 0),e8([(0,r.property)({type:Boolean})],e6.prototype,"loading",void 0),e8([(0,r.property)({type:String})],e6.prototype,"loadingSpinnerColor",void 0),e8([(0,r.property)()],e6.prototype,"rdnsId",void 0),e8([(0,r.property)()],e6.prototype,"displayIndex",void 0),e8([(0,r.property)()],e6.prototype,"walletRank",void 0),e6=e8([(0,z.customElement)("w3m-list-wallet")],e6),e.s(["W3mListWallet",()=>e6],530520);var e9=t;let e7=L.css`
  :host {
    --local-duration-height: 0s;
    --local-duration: ${({durations:e})=>e.lg};
    --local-transition: ${({easings:e})=>e["ease-out-power-2"]};
  }

  .container {
    display: block;
    overflow: hidden;
    overflow: hidden;
    position: relative;
    height: var(--local-container-height);
    transition: height var(--local-duration-height) var(--local-transition);
    will-change: height, padding-bottom;
  }

  .container[data-mobile-fullscreen='true'] {
    overflow: scroll;
  }

  .page {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    width: inherit;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border-bottom-left-radius: var(--local-border-bottom-radius);
    border-bottom-right-radius: var(--local-border-bottom-radius);
    transition: border-bottom-left-radius var(--local-duration) var(--local-transition);
  }

  .page[data-mobile-fullscreen='true'] {
    height: 100%;
  }

  .page-content {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .footer {
    height: var(--apkt-footer-height);
  }

  div.page[view-direction^='prev-'] .page-content {
    animation:
      slide-left-out var(--local-duration) forwards var(--local-transition),
      slide-left-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  div.page[view-direction^='next-'] .page-content {
    animation:
      slide-right-out var(--local-duration) forwards var(--local-transition),
      slide-right-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  @keyframes slide-left-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-left-in {
    from {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes slide-right-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-right-in {
    from {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }
`;var te=function(e,t,o,r){var i,a=arguments.length,n=a<3?t:null===r?r=Object.getOwnPropertyDescriptor(t,o):r;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,o,r);else for(var s=e.length-1;s>=0;s--)(i=e[s])&&(n=(a<3?i(n):a>3?i(t,o,n):i(t,o))||n);return a>3&&n&&Object.defineProperty(t,o,n),n};let tt=class extends e9.LitElement{constructor(){super(...arguments),this.resizeObserver=void 0,this.transitionDuration="0.15s",this.transitionFunction="",this.history="",this.view="",this.setView=void 0,this.viewDirection="",this.historyState="",this.previousHeight="0px",this.mobileFullScreen=v.OptionsController.state.enableMobileFullScreen,this.onViewportResize=()=>{this.updateContainerHeight()}}updated(e){if(e.has("history")){let e=this.history;""!==this.historyState&&this.historyState!==e&&this.onViewChange(e)}e.has("transitionDuration")&&this.style.setProperty("--local-duration",this.transitionDuration),e.has("transitionFunction")&&this.style.setProperty("--local-transition",this.transitionFunction)}firstUpdated(){this.transitionFunction&&this.style.setProperty("--local-transition",this.transitionFunction),this.style.setProperty("--local-duration",this.transitionDuration),this.historyState=this.history,this.resizeObserver=new ResizeObserver(e=>{for(let t of e)if(t.target===this.getWrapper()){let e=t.contentRect.height,o=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--apkt-footer-height")||"0");this.mobileFullScreen?(e=(window.visualViewport?.height||window.innerHeight)-this.getHeaderHeight()-o,this.style.setProperty("--local-border-bottom-radius","0px")):(e+=o,this.style.setProperty("--local-border-bottom-radius",o?"var(--apkt-borderRadius-5)":"0px")),this.style.setProperty("--local-container-height",`${e}px`),"0px"!==this.previousHeight&&this.style.setProperty("--local-duration-height",this.transitionDuration),this.previousHeight=`${e}px`}}),this.resizeObserver.observe(this.getWrapper()),this.updateContainerHeight(),window.addEventListener("resize",this.onViewportResize),window.visualViewport?.addEventListener("resize",this.onViewportResize)}disconnectedCallback(){let e=this.getWrapper();e&&this.resizeObserver&&this.resizeObserver.unobserve(e),window.removeEventListener("resize",this.onViewportResize),window.visualViewport?.removeEventListener("resize",this.onViewportResize)}render(){return o.html`
      <div class="container" data-mobile-fullscreen="${(0,a.ifDefined)(this.mobileFullScreen)}">
        <div
          class="page"
          data-mobile-fullscreen="${(0,a.ifDefined)(this.mobileFullScreen)}"
          view-direction="${this.viewDirection}"
        >
          <div class="page-content">
            <slot></slot>
          </div>
        </div>
      </div>
    `}onViewChange(e){let t=e.split(",").filter(Boolean),o=this.historyState.split(",").filter(Boolean),r=o.length,i=t.length,a=t[t.length-1]||"",n=B.UiHelperUtil.cssDurationToNumber(this.transitionDuration),s="";i>r?s="next":i<r?s="prev":i===r&&t[i-1]!==o[r-1]&&(s="next"),this.viewDirection=`${s}-${a}`,setTimeout(()=>{this.historyState=e,this.setView?.(a)},n),setTimeout(()=>{this.viewDirection=""},2*n)}getWrapper(){return this.shadowRoot?.querySelector("div.page")}updateContainerHeight(){let e=this.getWrapper();if(!e)return;let t=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--apkt-footer-height")||"0"),o=0;this.mobileFullScreen?(o=(window.visualViewport?.height||window.innerHeight)-this.getHeaderHeight()-t,this.style.setProperty("--local-border-bottom-radius","0px")):(o=e.getBoundingClientRect().height+t,this.style.setProperty("--local-border-bottom-radius",t?"var(--apkt-borderRadius-5)":"0px")),this.style.setProperty("--local-container-height",`${o}px`),"0px"!==this.previousHeight&&this.style.setProperty("--local-duration-height",this.transitionDuration),this.previousHeight=`${o}px`}getHeaderHeight(){return 60}};tt.styles=[e7],te([(0,r.property)({type:String})],tt.prototype,"transitionDuration",void 0),te([(0,r.property)({type:String})],tt.prototype,"transitionFunction",void 0),te([(0,r.property)({type:String})],tt.prototype,"history",void 0),te([(0,r.property)({type:String})],tt.prototype,"view",void 0),te([(0,r.property)({attribute:!1})],tt.prototype,"setView",void 0),te([(0,i.state)()],tt.prototype,"viewDirection",void 0),te([(0,i.state)()],tt.prototype,"historyState",void 0),te([(0,i.state)()],tt.prototype,"previousHeight",void 0),te([(0,i.state)()],tt.prototype,"mobileFullScreen",void 0),tt=te([(0,z.customElement)("w3m-router-container")],tt),e.s(["W3mRouterContainer",()=>tt],595604),e.s([],334570),e.i(334570),e.i(839010),e.i(530520),e.i(595604),e.s(["AppKitModal",()=>e2,"W3mListWallet",()=>e6,"W3mModal",()=>e1,"W3mModalBase",()=>e3,"W3mRouterContainer",()=>tt],271502)}]);