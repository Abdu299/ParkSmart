import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useParking } from '../state/ParkingProvider';
import { searchAddresses } from '../services/data';
import { designData } from './adapter';

export function useDesignBridge(send: (packet: unknown) => void) {
  const { data, refresh, progress } = useParking();
  const ready = useRef(false);
  const screen = useRef('home');
  const [activeScreen, setActiveScreen] = useState('home');
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('light');
  const picking = useRef(false);
  const locating = useRef(false);
  const searchVersion = useRef(0);
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
  const handle = async (packet: Record<string,unknown>) => {
    if(packet.type==='theme'&&(packet.theme==='light'||packet.theme==='dark')){setActiveTheme(packet.theme);return;}
    if(packet.type==='ready'){ready.current=true;publish();return;}
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
    if(packet.type==='photo'){
      if(picking.current)return;picking.current=true;
      try{
        if(packet.camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted){send({type:'photoError',message:'Kameratilgang ble ikke gitt. Du kan velge fra bilder.'});return;}}
        const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],base64:true,quality:0.6,allowsEditing:false};
        const result=packet.camera?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
        if(!result.canceled&&result.assets[0]?.base64){const bytes=result.assets[0].base64;if(bytes.length>6000000)throw Error('Bildet er for stort. Velg et mindre bilde.');send({type:'photo',dataUrl:`data:image/jpeg;base64,${bytes}`});}
      }catch{send({type:'photoError',message:'Bildet kunne ikke åpnes. Prøv et mindre JPG-bilde.'});}finally{picking.current=false;}
    }
  };
  return { handle, screen, activeScreen, activeTheme };
}
