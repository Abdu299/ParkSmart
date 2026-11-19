import { useCallback, useEffect, useRef } from 'react';
import { useDesignBridge } from '../design/useBridge';
const document = require('../design/document.json') as {html:string};
export default function ParkSmartScreen(){
 const frame=useRef<HTMLIFrameElement>(null);
 const send=useCallback((packet:unknown)=>frame.current?.contentWindow?.postMessage({channel:'parksmart:host',payload:packet},'*'),[]);
 const {handle}=useDesignBridge(send);
 useEffect(()=>{const listener=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.data?.channel==='parksmart:request')void handle(event.data.payload);};window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);},[handle]);
 return <iframe ref={frame} title="ParkSmart" srcDoc={document.html} allow="geolocation; camera; clipboard-write" style={{width:'100%',height:'100%',border:0,display:'block'}}/>;
}
