const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const IFC=require('web-ifc');
(async()=>{
 const file=process.argv[2];
 if(!file)throw new Error('Usage: npm run test:parser -- path/to/model.ifc');
 const bytes=new Uint8Array(fs.readFileSync(file));
 const api=new IFC.IfcAPI();
 await api.Init((name)=>path.join(path.dirname(require.resolve('web-ifc')),name));
 const id=api.OpenModel(bytes,{COORDINATE_TO_ORIGIN:true});
 const classes={beams:api.GetLineIDsWithType(id,IFC.IFCBEAM).size(),columns:api.GetLineIDsWithType(id,IFC.IFCCOLUMN).size()};
 const results=[];
 api.StreamAllMeshes(id,mesh=>{
  let vertices=0,triangles=0;const colors=[];
  for(let n=0;n<mesh.geometries.size();n++){
   const placed=mesh.geometries.get(n),geometry=api.GetGeometry(id,placed.geometryExpressID);
   vertices+=geometry.GetVertexDataSize()/6;triangles+=geometry.GetIndexDataSize()/3;
   colors.push([placed.color.x,placed.color.y,placed.color.z,placed.color.w]);geometry.delete();
  }
  results.push({id:mesh.expressID,type:api.GetNameFromTypeCode(api.GetLineType(id,mesh.expressID)),vertices,triangles,colors});
 });
 assert(results.length>0,'No geometry objects found');
 assert(results.every(r=>r.vertices>0&&r.triangles>0));
 const colors=[...new Set(results.flatMap(r=>r.colors.map(c=>JSON.stringify(c))))];
 console.log(JSON.stringify({bytes:bytes.length,...classes,geometryItems:results.length,geometryTypes:results.reduce((a,r)=>(a[r.type]=(a[r.type]||0)+1,a),{}),totalTriangles:results.reduce((a,r)=>a+r.triangles,0),colors},null,2));
 api.CloseModel(id);api.Dispose();
})().catch(e=>{console.error(e);process.exitCode=1});
