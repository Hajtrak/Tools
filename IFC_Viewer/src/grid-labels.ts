import * as THREE from 'three';

// Canvas sprites keep exported axis names upright and readable while orbiting.
export function createGridLabels(grids: THREE.Group) {
 const labels: THREE.Sprite[]=[];
 const lines: THREE.Line[]=[];
 grids.traverse(object=>{if(object instanceof THREE.Line&&object.userData.kind==='line')lines.push(object);});
 for(const line of lines){
  const name=String(line.userData.tag??'').trim();
  const positions=line.geometry.getAttribute('position');
  if(!name||!positions||positions.count<2)continue;
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');if(!context)continue;
  context.font='600 36px "Segoe UI", sans-serif';
  canvas.width=Math.ceil(context.measureText(name).width)+32;canvas.height=64;
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
  context.strokeStyle='#526d7b';context.lineWidth=3;context.strokeRect(2,2,canvas.width-4,canvas.height-4);
  context.font='600 36px "Segoe UI", sans-serif';context.textAlign='center';context.textBaseline='middle';
  context.fillStyle='#24343c';context.fillText(name,canvas.width/2,canvas.height/2);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,sizeAttenuation:false});
  for(const index of [0,positions.count-1]){
   const label=new THREE.Sprite(material);
   label.name=name;label.userData.kind='grid-name';label.renderOrder=2;
   label.position.fromBufferAttribute(positions,index);
   label.scale.set(.032*canvas.width/canvas.height,.032,1);
   line.add(label);labels.push(label);
  }
 }
 return {
  count:labels.length,
  setVisible(visible:boolean){for(const label of labels)label.visible=visible;},
  dispose(){
   const materials=new Set(labels.map(label=>label.material));
   for(const label of labels)label.removeFromParent();
   for(const material of materials){material.map?.dispose();material.dispose();}
  },
 };
}
