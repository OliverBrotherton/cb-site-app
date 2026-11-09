/* Survey PDF: builds an A4 report on the phone with jsPDF (loaded only when needed). */

let jsPdfLib;
function loadJsPDF(){
  if(window.jspdf)return Promise.resolve(window.jspdf);
  return jsPdfLib||(jsPdfLib=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';sc.onload=()=>res(window.jspdf);sc.onerror=()=>{jsPdfLib=null;rej(new Error('load'))};document.head.appendChild(sc)}));
}

// Photo bytes come from this site (raw=1), so they can go into the PDF
async function pdfImage(path){
  const r=await fetch(src(path)+'&raw=1');if(!r.ok)throw new Error('photo');
  const blob=await r.blob();
  const url=await new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=rej;f.readAsDataURL(blob)});
  const dims=await new Promise(res=>{const i=new Image();i.onload=()=>res({w:i.naturalWidth,h:i.naturalHeight});i.onerror=()=>res(null);i.src=url});
  if(!dims)throw new Error('photo');
  return{url,fmt:/png/i.test(blob.type)?'PNG':'JPEG',...dims};
}

const PDF_RED=[207,21,35],PDF_INK=[32,32,36],PDF_MUTED=[94,94,102],PDF_LINE=[222,222,226],PDF_SOFT=[244,244,246],PDF_RED_SOFT=[251,231,233];

// The CB mark, drawn as shapes so it stays sharp
function pdfLogo(doc,x,y,w){
  const k=w/792,P=(px,py)=>[x+px*k,y+py*k];
  const shape=(pts,rgb)=>{
    doc.setFillColor(...rgb);
    const [x0,y0]=P(...pts[0]);
    doc.lines(pts.slice(1).map((p,i)=>{const a=P(...pts[i]),b=P(...p);return[b[0]-a[0],b[1]-a[1]]}),x0,y0,[1,1],'F',true);
  };
  shape([[367,0],[0,0],[0,525],[367,525],[367,439],[87,439],[87,87],[367,87]],PDF_RED);
  shape([[422,0],[792,0],[792,525],[422,525],[422,439],[707,439],[707,306],[509,306],[509,387],[422,387],[422,138],[509,138],[509,219],[707,219],[707,87],[422,87]],PDF_INK);
}

async function surveyPdf(sv,btn){
  const p=S.props.get(sv.property_id)||{};
  const label=btn&&btn.innerHTML;
  if(btn){btn.disabled=true;btn.textContent='Making PDF…'}
  try{
    const {jsPDF}=await loadJsPDF();
    const doc=new jsPDF({unit:'pt',format:'a4'});
    const W=595.28,H=841.89,M=40,CW=W-2*M,BOTTOM=H-50;
    let y=M;
    const secs=surveySections(sv.type,sv),a=sv.answers||{};
    const answerText=v=>Array.isArray(v)?v.join(', '):String(v??'');
    const isFlag=(q,v)=>q[4]&&(v===q[4]||(Array.isArray(v)&&v.includes(q[4])));
    const font=(size,style='normal',rgb=PDF_INK)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...rgb)};
    const need=h=>{if(y+h>BOTTOM){doc.addPage();y=M}};

    // ---- header ----
    pdfLogo(doc,M,y,54);
    font(15,'bold',PDF_RED);doc.text('Chas',M+64,y+15);
    font(15,'normal',PDF_INK);doc.text('Berger',M+64,y+32);
    font(9,'bold',PDF_MUTED);doc.text('PRE-WORKS SURVEY',W-M,y+10,{align:'right'});
    font(18,'bold');doc.text(`${WORKS[sv.type]||sv.type} survey`,W-M,y+30,{align:'right'});
    y+=48;doc.setDrawColor(...PDF_RED);doc.setLineWidth(2);doc.line(M,y,W-M,y);y+=18;

    // ---- details ----
    font(16,'bold');const addr=doc.splitTextToSize(p.address||'',CW);doc.text(addr,M,y+4);y+=addr.length*19;
    font(13,'bold',PDF_RED);doc.text(p.postcode||'',M,y+2);y+=18;
    const det=[['UPRN / ref',p.ref],['Project',projectName(p)],['Surveyor',sv.by_name],['Status',sv.status==='submitted'?'Submitted':'Draft'],['Date',fmtDate(sv.submitted_at||sv.updated_at)],['Access notes',p.notes]].filter(r=>r[1]);
    font(10);
    for(const [k,v] of det){const lines=doc.splitTextToSize(String(v),CW-110);need(lines.length*13+4);font(10,'normal',PDF_MUTED);doc.text(k,M,y);font(10,'bold');doc.text(lines,M+110,y);y+=lines.length*13+3}
    y+=8;

    // ---- asbestos ----
    const asb=asbStatus(p),present=asb==='Asbestos present';
    const asbText=present?`Asbestos present: ${p.asb_notes||''}${p.asb_impact?' ('+p.asb_impact+')':''}`:asb==='No asbestos found'?`No asbestos found${p.asb_ref?' (survey '+p.asb_ref+')':''}`:asb==='No survey available'?'No asbestos survey available':'Asbestos survey not checked yet';
    const asbLines=doc.splitTextToSize(asbText,CW-20);const ah=asbLines.length*13+14;need(ah);
    doc.setFillColor(...(present?PDF_RED_SOFT:PDF_SOFT));doc.roundedRect(M,y,CW,ah,4,4,'F');
    font(10,'bold',present?PDF_RED:PDF_INK);doc.text(asbLines,M+10,y+17);y+=ah+12;

    // ---- items to check ----
    const flags=[];secs.forEach(sec=>sec.qs.forEach(q=>{if(isFlag(q,a[q[0]]))flags.push(`${sec.title}: ${q[1]} ${answerText(a[q[0]])}`)}));
    if(flags.length){
      const fl=flags.map(f=>doc.splitTextToSize('• '+f,CW-24));const fh=fl.reduce((n,l)=>n+l.length*13,0)+30;need(fh);
      doc.setDrawColor(...PDF_RED);doc.setLineWidth(1.2);doc.roundedRect(M,y,CW,fh,4,4,'S');
      font(11,'bold',PDF_RED);doc.text(`${flags.length} item${flags.length>1?'s':''} to check`,M+12,y+18);
      let fy=y+33;font(10,'normal',PDF_INK);for(const l of fl){doc.text(l,M+12,fy);fy+=l.length*13}
      y+=fh+14;
    }

    // ---- sections ----
    const QW=CW*0.56,AW=CW-QW-12;
    for(const [i,sec] of secs.entries()){
      need(60);
      doc.setFillColor(...PDF_SOFT);doc.rect(M,y,CW,24,'F');
      font(11,'bold',PDF_RED);doc.text(`${i+1}/${secs.length}`,M+8,y+16);
      font(12,'bold');doc.text(sec.title,M+44,y+16);y+=32;
      for(const q of sec.qs){
        const v=a[q[0]];const has=v!=null&&answerText(v)!=='';const flag=isFlag(q,v);
        font(10);const ql=doc.splitTextToSize(q[1],QW);
        font(10,'bold');const al=doc.splitTextToSize(has?answerText(v):'Not answered',AW);
        const h=Math.max(ql.length,al.length)*13+8;need(h);
        font(10,'normal',PDF_MUTED);doc.text(ql,M,y+10);
        font(10,has?'bold':'italic',flag?PDF_RED:has?PDF_INK:PDF_MUTED);doc.text(al,M+QW+12,y+10);
        y+=h;doc.setDrawColor(...PDF_LINE);doc.setLineWidth(0.5);doc.line(M,y-3,W-M,y-3);
      }
      // photos for this section, three to a row
      const paths=(sv.photos||{})[sec.pkey]||[];
      if(paths.length){
        y+=6;const gap=10,cw=(CW-2*gap)/3,ch=cw*0.75;
        for(let j=0;j<paths.length;j+=3){
          need(ch+20);
          for(let k=0;k<3&&j+k<paths.length;k++){
            const x=M+k*(cw+gap);
            try{
              const img=await pdfImage(paths[j+k]);
              const s=Math.min(cw/img.w,ch/img.h),iw=img.w*s,ih=img.h*s;
              doc.setFillColor(...PDF_SOFT);doc.rect(x,y,cw,ch,'F');
              doc.addImage(img.url,img.fmt,x+(cw-iw)/2,y+(ch-ih)/2,iw,ih,undefined,'MEDIUM');
            }catch(e){doc.setFillColor(...PDF_SOFT);doc.rect(x,y,cw,ch,'F');font(9,'italic',PDF_MUTED);doc.text('Photo unavailable',x+cw/2,y+ch/2,{align:'center'})}
            font(8,'normal',PDF_MUTED);doc.text(`${sec.title}, photo ${j+k+1}`,x,y+ch+10);
          }
          y+=ch+20;
        }
      }
      y+=10;
    }

    // ---- footer on every page ----
    const n=doc.getNumberOfPages();
    for(let i=1;i<=n;i++){
      doc.setPage(i);doc.setDrawColor(...PDF_LINE);doc.setLineWidth(0.5);doc.line(M,H-34,W-M,H-34);
      font(8,'normal',PDF_MUTED);
      doc.text(`Chas Berger · ${WORKS[sv.type]||sv.type} survey · ${p.address||''} ${p.postcode||''}`.slice(0,110),M,H-22);
      doc.text(`Page ${i} of ${n} · Printed ${fmtDate(Date.now())}`,W-M,H-22,{align:'right'});
    }
    const safe=s=>String(s||'').replace(/[\\/:*?"<>|]+/g,'').trim();
    doc.save(`${safe(p.address)} - ${WORKS[sv.type]||sv.type} survey.pdf`);
    toast('PDF downloaded');
  }catch(e){toast('The PDF couldn\'t be made. Check your signal and try again.')}
  finally{if(btn){btn.disabled=false;btn.innerHTML=label}}
}
