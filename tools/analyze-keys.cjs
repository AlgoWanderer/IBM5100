// Offline analysis: world-space islands of the key meshes in the GLB.
const fs=require("fs");const b=fs.readFileSync(process.argv[2]);
const jl=b.readUInt32LE(12);const j=JSON.parse(b.toString("utf8",20,20+jl));const binStart=20+jl+8;
function acc(i){const a=j.accessors[i],bv=j.bufferViews[a.bufferView];const off=binStart+(bv.byteOffset||0)+(a.byteOffset||0);
 const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];const T={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array}[a.componentType];
 const stride=bv.byteStride?bv.byteStride/T.BYTES_PER_ELEMENT:comps;const n=(a.count-1)*stride+comps;
 const arr=new T(b.buffer.slice(b.byteOffset+off,b.byteOffset+off+n*T.BYTES_PER_ELEMENT));const out=[];
 for(let k=0;k<a.count;k++)out.push(Array.from(arr.slice(k*stride,k*stride+comps)));return out;}
const mul=(A,B)=>{const C=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)C[c*4+r]+=A[k*4+r]*B[c*4+k];return C};
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function local(n){if(n.matrix)return n.matrix;const t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];const[x,y,z,w]=q;
 return[(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,t[0],t[1],t[2],1];}
const world={};function walk(i,P){const M=mul(P,local(j.nodes[i]));world[i]=M;(j.nodes[i].children||[]).forEach(c=>walk(c,M));}
j.scenes[j.scene||0].nodes.forEach(r=>walk(r,I));
const tx=(M,v)=>[0,1,2].map(r=>M[r]*v[0]+M[4+r]*v[1]+M[8+r]*v[2]+M[12+r]);
function bbox(ni){const p=j.meshes[j.nodes[ni].mesh].primitives;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const pr of p)for(const v of acc(pr.attributes.POSITION)){const w=tx(world[ni],v);for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],w[k]);mx[k]=Math.max(mx[k],w[k]);}}return{mn,mx};}
const f3=a=>a.map(x=>x.toFixed(3)).join(",");
for(const [n,nm] of [[88,"Main"],[86,"Front"],[90,"Glass"]]){const bb=bbox(n);console.log(nm,"min",f3(bb.mn),"max",f3(bb.mx));}
const isl=[];
for(const ni of [6,7]){for(const p of j.meshes[j.nodes[ni].mesh].primitives){const pos=acc(p.attributes.POSITION).map(v=>tx(world[ni],v));const idx=acc(p.indices).map(x=>x[0]);
 const key=v=>v.map(x=>x.toFixed(5)).join(",");const weld=new Map();const vid=pos.map(v=>{const k=key(v);if(!weld.has(k))weld.set(k,weld.size);return weld.get(k)});
 const par=[...Array(weld.size).keys()];const f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x]}return x};
 for(let t=0;t<idx.length;t+=3){const a=f(vid[idx[t]]);par[f(vid[idx[t+1]])]=a;par[f(vid[idx[t+2]])]=a;}
 const g=new Map();pos.forEach((v,k)=>{const r=f(vid[k]);if(!g.has(r))g.set(r,{mn:[1e9,1e9,1e9],mx:[-1e9,-1e9,-1e9],n:0});const o=g.get(r);o.n++;for(let q=0;q<3;q++){o.mn[q]=Math.min(o.mn[q],v[q]);o.mx[q]=Math.max(o.mx[q],v[q]);}});
 for(const o of g.values())isl.push({...o,c:o.mn.map((m,q)=>(m+o.mx[q])/2),s:o.mn.map((m,q)=>o.mx[q]-m),mesh:ni});}}
isl.sort((a,b)=>a.c[2]-b.c[2]||a.c[0]-b.c[0]);
isl.forEach((o,i)=>console.log(i,"c",f3(o.c),"size",f3(o.s),"v",o.n,"m",o.mesh));
// --- screen inspection ---
if (process.argv[3]==="screen"){
 const gl=acc(j.meshes[j.nodes[90].mesh].primitives[0].attributes.POSITION).map(v=>tx(world[90],v));
 const uniq=[...new Set(gl.map(v=>f3(v)))];console.log("GLASS verts",uniq.join(" | "));
 // screen island = biggest island in panel (index 0 after sort)
 const p=j.meshes[j.nodes[6].mesh].primitives[0];const pos=acc(p.attributes.POSITION).map(v=>tx(world[6],v));
 const nrm=acc(p.attributes.NORMAL);
 const s=isl[0];const inBox=(v)=>v.every((x,q)=>x>=s.mn[q]-1e-6&&x<=s.mx[q]+1e-6);
 const hist={};pos.forEach((v,k)=>{if(!inBox(v))return;const n=nrm[k];const key=n.map(x=>Math.round(x*2)/2).join(",");hist[key]=(hist[key]||0)+1;});
 console.log("SCREEN island normal histogram (local normals, rounded):",JSON.stringify(hist));
 const ys=pos.filter(inBox);const top=ys.filter(v=>v[1]>s.mx[1]-0.001),bot=ys.filter(v=>v[1]<s.mn[1]+0.001);
 const avg=(a,q)=>a.reduce((t,v)=>t+v[q],0)/a.length;console.log("top z",avg(top,2).toFixed(4),"bottom z",avg(bot,2).toFixed(4));
}
