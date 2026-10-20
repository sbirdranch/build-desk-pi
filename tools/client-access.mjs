import {BlockList,isIP} from 'node:net';

// Editing over HTTP is an explicit deployment choice. Match real socket addresses
// and configured Host values; forwarded headers never establish this access.
/** @param {Record<string,string|undefined>} env */
export function createClientAccessPolicy(env=process.env){
 const subnet=env.BUILDDESK_LAN_SUBNET||'';
 const hosts=new Set((env.BUILDDESK_LAN_HOSTS||'').split(',').map(host=>host.trim().toLowerCase()).filter(Boolean));
 const network=new BlockList();
 if(subnet){
  const [address,prefix,...extra]=subnet.split('/');
  if(extra.length||isIP(address)!==4||!/^\d+$/.test(prefix||'')||Number(prefix)>32)throw Error('BUILDDESK_LAN_SUBNET must be an IPv4 CIDR such as 192.168.0.0/24.');
  if(!hosts.size)throw Error('BUILDDESK_LAN_HOSTS is required when LAN editing is enabled.');
  network.addSubnet(address,Number(prefix),'ipv4');
 }
 return (socketAddress,host)=>{
  const address=(socketAddress||'').replace(/^::ffff:/i,'');
  const local=address==='127.0.0.1'||address==='::1';
  const lan=!!subnet&&isIP(address)===4&&network.check(address,'ipv4')&&hosts.has((host||'').toLowerCase());
  return {local,editor:local||lan};
 };
}

export function setClientAccessHeaders(request,policy){
 const access=policy(request.socket.remoteAddress,request.headers.host);
 request.headers['x-builddesk-local']=access.local?'1':'0';
 request.headers['x-builddesk-editor']=access.editor?'1':'0';
}
