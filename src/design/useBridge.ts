import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useParking } from '../state/ParkingProvider';
import { searchAddresses } from '../services/data';
import { designData } from './adapter';
import { authErrorMessage, firebaseConfigured, loginWithEmail, logoutUser, observeAuth, registerWithEmail, resetPassword } from '../services/firebase';

const AI_ENDPOINT = process.env.EXPO_PUBLIC_PARKSMART_AI_URL?.trim();

export function useDesignBridge(send: (packet: unknown) => void) {
  const { data, refresh, progress } = useParking();
  const ready = useRef(false);
  const screen = useRef('home');
  const [activeScreen, setActiveScreen] = useState('home');
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('light');
  const picking = useRef(false);
  const locating = useRef(false);
  const searchVersion = useRef(0);
  const authBusy = useRef(false);
  const authUser = useRef<{uid:string;email:string}|null>(null);
  const allowedHosts = ['www.google.com','www.oslo.kommune.no','geodata.bymoslo.no','parkreg-open.atlas.vegvesen.no','www.vegvesen.no','lovdata.no','www.kartverket.no'];
  const publish = useCallback(() => {
    if (!ready.current) return;
    const items = designData(data);
    send({type:'dataBegin'});
    for(let offset=0;offset<items.length;offset+=150) send({type:'dataChunk',items:items.slice(offset,offset+150)});
    send({type:'dataEnd'});
  }, [data, send]);
  useEffect(() => { publish(); },[publish]);
  useEffect(() => { if(progress&&ready.current) send({type:'progress',message:progress}); },[progress,send]);
  useEffect(() => {const timer=setInterval(publish,60000);return()=>clearInterval(timer);},[publish]);
  const publishAuth = useCallback(() => {
    if (!ready.current) return;
    send({type:'authState',configured:firebaseConfigured,user:authUser.current});
  },[send]);
  useEffect(() => observeAuth(user => {
    authUser.current=user?{uid:user.uid,email:user.email||''}:null;
    publishAuth();
  }),[publishAuth]);
  const handle = async (packet: Record<string,unknown>) => {
    if(packet.type==='theme'&&(packet.theme==='light'||packet.theme==='dark')){setActiveTheme(packet.theme);return;}
    if(packet.type==='ready'){ready.current=true;publish();publishAuth();return;}
    if(packet.type==='screen'){if(typeof packet.screen==='string'){screen.current=packet.screen;setActiveScreen(packet.screen);}return;}
    if(packet.type==='refresh'){await refresh();return;}
    if(packet.type==='locate'){
      if(locating.current)return;locating.current=true;
      try{
        const permission=await Location.requestForegroundPermissionsAsync();
        if(!permission.granted){send({type:'locationError',message:'Posisjon ikke delt · trykk for å prøve igjen'});return;}
        const point=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
        let label=`${point.coords.latitude.toFixed(4)}, ${point.coords.longitude.toFixed(4)}`;
        try{const [a]=await Location.reverseGeocodeAsync(point.coords);if(a){const parts=[a.street||a.district,a.city||a.subregion||a.region].filter(Boolean);if(parts.length)label=[...new Set(parts)].join(', ');}}catch{}
        send({type:'location',latitude:point.coords.latitude,longitude:point.coords.longitude,label});
      }catch{send({type:'locationError',message:'Kunne ikke hente posisjon · trykk for å prøve igjen'});}finally{locating.current=false;}return;
    }
    if(packet.type==='search'&&typeof packet.query==='string'){
      const version=++searchVersion.current;
      try{const results=await searchAddresses(packet.query.slice(0,200));if(version!==searchVersion.current)return;if(!results[0])throw Error();send({type:'searchResult',...results[0]});}
      catch{if(version===searchVersion.current)send({type:'searchError',message:'Fant ikke adressen i Oslo. Prøv gatenavn og nummer.'});}return;
    }
    if(packet.type==='copy'||packet.type==='navigate'){
      const p=data.locations.find(x=>x.id===packet.id);if(!p)return;
      try{if(packet.type==='copy'){await Clipboard.setStringAsync(p.address||`${p.latitude}, ${p.longitude}`);send({type:'copyDone',message:p.address?'Adresse kopiert':'Koordinater kopiert'});}else await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.latitude},${p.longitude}`)}&travelmode=driving`);}
      catch{send({type:'copyDone',message:'Handlingen kunne ikke fullføres. Prøv igjen.'});}return;
    }
    if(packet.type==='external'&&typeof packet.url==='string'){
      try{const url=new URL(packet.url);if(url.protocol==='https:'&&allowedHosts.includes(url.hostname))await Linking.openURL(url.toString());}catch{}return;
    }
    if(packet.type==='authLogin'||packet.type==='authRegister'||packet.type==='authReset'||packet.type==='authLogout'){
      if(authBusy.current)return;
      const email=typeof packet.email==='string'?packet.email.trim().toLowerCase().slice(0,254):'';
      const password=typeof packet.password==='string'?packet.password.slice(0,4096):'';
      if(!firebaseConfigured){send({type:'authError',message:'Firebase er ikke konfigurert ennå. Legg Firebase-verdiene i .env og start Expo på nytt.'});return;}
      if(packet.type!=='authLogout'&&!email){send({type:'authError',message:'Skriv inn e-postadressen din.'});return;}
      if((packet.type==='authLogin'||packet.type==='authRegister')&&!password){send({type:'authError',message:'Skriv inn passordet ditt.'});return;}
      if(packet.type==='authRegister'&&password.length<6){send({type:'authError',message:'Passordet må ha minst 6 tegn.'});return;}
      authBusy.current=true;send({type:'authBusy',value:true});
      try{
        if(packet.type==='authLogin')await loginWithEmail(email,password);
        if(packet.type==='authRegister')await registerWithEmail(email,password);
        if(packet.type==='authReset'){await resetPassword(email);send({type:'authMessage',message:'Vi har sendt en lenke for å lage nytt passord, hvis e-posten tilhører en konto.'});}
        if(packet.type==='authLogout')await logoutUser();
        if(packet.type!=='authReset')send({type:'authSuccess',action:packet.type});
      }catch(error){send({type:'authError',message:authErrorMessage(error)});}
      finally{authBusy.current=false;send({type:'authBusy',value:false});}
      return;
    }
    if(packet.type==='aiAsk'){
      const requestId=typeof packet.requestId==='string'?packet.requestId.slice(0,100):'ai';
      if(!AI_ENDPOINT){send({type:'aiError',requestId,message:'AI er ikke konfigurert ennå. Legg EXPO_PUBLIC_PARKSMART_AI_URL i .env og start Expo på nytt.'});return;}
      if(typeof packet.question!=='string'||packet.question.trim().length===0){send({type:'aiError',requestId,message:'Skriv et spørsmål først.'});return;}
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),18000);
      try{
        const response=await fetch(AI_ENDPOINT,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          signal:controller.signal,
          body:JSON.stringify({
            question:packet.question.trim().slice(0,500),
            history:Array.isArray(packet.history)?packet.history.slice(-8):[],
            imageDataUrl:typeof packet.imageDataUrl==='string'&&packet.imageDataUrl.startsWith('data:image/')?packet.imageDataUrl:null,
            latitude:typeof packet.latitude==='number'?packet.latitude:null,
            longitude:typeof packet.longitude==='number'?packet.longitude:null,
            parking:Array.isArray(packet.parking)?packet.parking.slice(0,8):[]
          })
        });
        const result=await response.json() as {answer?:unknown;parkingIds?:unknown;signCode?:unknown;error?:unknown};
        if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'AI-tjenesten svarte med en feil.');
        if(typeof result.answer!=='string')throw new Error('AI-tjenesten ga et ugyldig svar.');
        send({type:'aiResult',requestId,answer:result.answer,parkingIds:Array.isArray(result.parkingIds)?result.parkingIds.filter((id):id is string=>typeof id==='string').slice(0,3):[],signCode:typeof result.signCode==='string'?result.signCode:''});
      }catch(error){
        const raw=error instanceof Error?error.message:'';
        const timedOut=error instanceof Error&&(error.name==='AbortError'||/cancel|abort|timed?\s*out/i.test(raw));
        const message=timedOut?'AI-tjenesten brukte for lang tid. Prøv igjen.':raw||'AI-tjenesten svarte ikke. Prøv igjen om litt.';
        send({type:'aiError',requestId,message});
      }finally{clearTimeout(timeout);}
      return;
    }
    if(packet.type==='photo'){
      if(picking.current)return;picking.current=true;
      try{
        if(packet.camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted){send({type:'photoError',message:'Kameratilgang ble ikke gitt. Du kan velge fra bilder.'});return;}}
        const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],base64:true,quality:0.6,allowsEditing:false};
        const result=packet.camera?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
        if(!result.canceled&&result.assets[0]?.base64){const bytes=result.assets[0].base64;if(bytes.length>4500000)throw Error('Bildet er for stort. Velg et mindre bilde.');send({type:'photo',target:packet.target==='ai'?'ai':'sign',dataUrl:`data:image/jpeg;base64,${bytes}`});}
      }catch{send({type:'photoError',target:packet.target==='ai'?'ai':'sign',message:'Bildet kunne ikke åpnes. Prøv et mindre JPG-bilde.'});}finally{picking.current=false;}
    }
  };
  return { handle, screen, activeScreen, activeTheme };
}
