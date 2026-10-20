import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientAccessPolicy,setClientAccessHeaders} from '../../tools/client-access.mjs';
import {editor,local,requireEditor} from '../src/server/security';
import {DomainError} from '../src/core/domain';

const host='192.168.0.119:4174';
const enabled={BUILDDESK_LAN_SUBNET:'192.168.0.0/24',BUILDDESK_LAN_HOSTS:host};

test('default access keeps LAN read-only and recognizes actual loopback sockets',()=>{
 const policy=createClientAccessPolicy({});
 for(const address of ['127.0.0.1','::1','::ffff:127.0.0.1'])assert.deepEqual(policy(address,host),{local:true,editor:true});
 assert.deepEqual(policy('192.168.0.42',host),{local:false,editor:false});
});

test('LAN editing requires both the configured subnet and site address; spoofed headers cannot grant it',()=>{
 const policy=createClientAccessPolicy(enabled);
 for(const address of ['192.168.0.42','::ffff:192.168.0.42'])assert.deepEqual(policy(address,host),{local:false,editor:true});
 for(const address of ['192.168.1.42','10.0.0.42','203.0.113.42','::1:1234',''])assert.equal(policy(address,host).editor,false);
 assert.equal(policy('192.168.0.42','other.example:4174').editor,false);
 assert.equal(policy('192.168.0.42','192.168.0.119:8080').editor,false);
 const forged={socket:{remoteAddress:'203.0.113.42'},headers:{host,'x-builddesk-local':'1','x-builddesk-editor':'1','x-forwarded-for':'192.168.0.42'}};
 setClientAccessHeaders(forged,policy);
 assert.equal(forged.headers['x-builddesk-local'],'0');assert.equal(forged.headers['x-builddesk-editor'],'0');
 const lan={socket:{remoteAddress:'192.168.0.42'},headers:{host,'x-builddesk-local':'1','x-builddesk-editor':'0'}};
 setClientAccessHeaders(lan,policy);
 assert.equal(lan.headers['x-builddesk-local'],'0');assert.equal(lan.headers['x-builddesk-editor'],'1');
});

test('LAN configuration fails closed when its subnet or site address is missing or invalid',()=>{
 for(const subnet of ['192.168.0.0','192.168.0.0/33','192.168.0.0/-1','bad/24','192.168.0.0/24/1'])assert.throws(()=>createClientAccessPolicy({...enabled,BUILDDESK_LAN_SUBNET:subnet}),/IPv4 CIDR/);
 assert.throws(()=>createClientAccessPolicy({BUILDDESK_LAN_SUBNET:'192.168.0.0/24'}),/LAN_HOSTS/);
});

test('LAN editors retain origin and token checks without becoming host-local clients',()=>{
 const previous=process.env.BUILDDESK_EDIT_TOKEN;process.env.BUILDDESK_EDIT_TOKEN='lan-test-token';
 try{
  const make=(origin='http://'+host,token='lan-test-token')=>new Request('http://'+host+'/api',{headers:{host,origin,'x-builddesk-local':'0','x-builddesk-editor':'1','x-builddesk-token':token}});
  assert.equal(editor(make()),true);assert.equal(local(make()),false);assert.doesNotThrow(()=>requireEditor(make()));
  const denied=(origin:string,token?:string)=>assert.throws(()=>requireEditor(make(origin,token)),error=>error instanceof DomainError&&error.status===403);
  denied('https://other.example');denied('invalid origin');denied('');denied('http://'+host,'wrong');denied('http://'+host,'é'.repeat('lan-test-token'.length));
 }finally{if(previous===undefined)delete process.env.BUILDDESK_EDIT_TOKEN;else process.env.BUILDDESK_EDIT_TOKEN=previous}
});
