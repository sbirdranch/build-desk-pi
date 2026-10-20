import type {Metadata} from 'next';import './styles.css';
export const metadata:Metadata={title:'Build Desk Pi — IntegratedSA LLC',description:'Raspberry Pi hosted build production tracking',icons:{icon:'/api/branding/favicon.ico'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
