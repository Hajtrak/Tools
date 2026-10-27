import * as THREE from 'three';

// Read axis geometry rather than grid placements: one IFC grid can contain
// axes at several elevations. Ignore label sprites when measuring heights.
export function gridAxisElevations(grids: THREE.Group) {
 grids.updateWorldMatrix(true,true);
 const axes:{object:THREE.Object3D;elevation:number}[]=[];
 grids.traverse(object=>{
  if(object.userData.kind!=='axis')return;
  let low=Infinity,high=-Infinity,total=0,count=0;
  object.traverse(child=>{
   if(!(child instanceof THREE.Line)||child.userData.kind!=='line')return;
   const positions=child.geometry.getAttribute('position');if(!positions)return;
   const point=new THREE.Vector3();
   for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(child.matrixWorld);
    if(!Number.isFinite(point.y))continue;
    low=Math.min(low,point.y);high=Math.max(high,point.y);total+=point.y;count++;
   }
  });
  // A base-level grid is horizontal. Vertical/sloping axes are available in All.
  if(count&&high-low<=.01)axes.push({object,elevation:total/count});
 });
 return axes;
}

export function setBaseGridOnly(grids:THREE.Group,baseOnly:boolean){
 const axes=gridAxisElevations(grids);
 const lowest=axes.reduce((height,axis)=>Math.min(height,axis.elevation),Infinity);
 const base=new Set(axes.filter(axis=>axis.elevation<=lowest+.01).map(axis=>axis.object));
 grids.traverse(object=>{
  if(object.userData.kind==='axis')object.visible=!baseOnly||!axes.length||base.has(object);
 });
}
