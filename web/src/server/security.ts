import {timingSafeEqual} from 'node:crypto';
import {DomainError} from '../core/domain';
export function local(request:Request){return request.headers.get('x-builddesk-local')==='1'}
export function editor(request:Request){return local(request)||request.headers.get('x-builddesk-editor')==='1'}
export function requireEditor(request:Request){
 if(!editor(request))throw new DomainError('This connection is read-only. Use the configured Build Desk Pi home-network address to make changes.',403);
 const origin=request.headers.get('origin');const host=request.headers.get('host');let originHost;try{originHost=origin?new URL(origin).host:null}catch{originHost=null}
 if(!originHost||originHost!==host)throw new DomainError('Save requests must come from this app.',403);
 const token=Buffer.from(request.headers.get('x-builddesk-token')||''),expected=Buffer.from(process.env.BUILDDESK_EDIT_TOKEN||'');
 if(!expected.length||token.length!==expected.length||!timingSafeEqual(token,expected))throw new DomainError('Refresh the app before saving.',403);
}
