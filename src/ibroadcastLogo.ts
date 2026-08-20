export async function createIbroadcastLogoBlob():Promise<Blob>{
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not create logo canvas');
  ctx.fillStyle='#080a0d';ctx.fillRect(0,0,128,128);
  const gradient=ctx.createLinearGradient(20,20,108,108);gradient.addColorStop(0,'#d2ff45');gradient.addColorStop(1,'#8ee8ff');
  ctx.strokeStyle=gradient;ctx.lineWidth=10;ctx.beginPath();ctx.arc(64,64,38,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#f4f7f9';ctx.font='700 28px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('O',64,64);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode PNG logo')),'image/png'));
}

export async function ibroadcastLogoPreviewUrl():Promise<string>{return URL.createObjectURL(await createIbroadcastLogoBlob());}
