import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setBaseGridOnly} from '../.cache/grid-visibility.js';

const root=new THREE.Group();
root.position.set(30,-12,20);
function axis(parent,height){
 const group=new THREE.Group();group.userData.kind='axis';
 const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,height,0),new THREE.Vector3(10,height,0)]);
 const line=new THREE.Line(geometry);line.userData.kind='line';group.add(line);parent.add(group);
 // An outlying label must never affect the elevation measurement.
 const label=new THREE.Sprite();label.position.y=-100;line.add(label);
 return group;
}
const grid=new THREE.Group();root.add(grid);
const ground=axis(grid,0),nearGround=axis(grid,.005),upper=axis(grid,3);
const transformed=new THREE.Group();transformed.position.y=6;root.add(transformed);
const transformedUpper=axis(transformed,0);
const separateBase=new THREE.Group();separateBase.position.y=-3;root.add(separateBase);
const matchingBase=axis(separateBase,3);
setBaseGridOnly(root,true);
assert.equal(ground.visible,true);assert.equal(nearGround.visible,true);
assert.equal(matchingBase.visible,true,'Use world coordinates across separate grid placements');
assert.equal(upper.visible,false,'Filter different elevations within a single IFC grid');
assert.equal(transformedUpper.visible,false);
assert.equal(root.visible,true,'Leave the overall gridline toggle unchanged');
setBaseGridOnly(root,false);
assert.ok([ground,nearGround,upper,transformedUpper,matchingBase].every(axis=>axis.visible));
root.visible=false;setBaseGridOnly(root,true);assert.equal(root.visible,false);
setBaseGridOnly(new THREE.Group(),true);
console.log('Grid visibility tests passed: mixed elevations, placement transforms, tolerance, labels, show all and independent gridline toggle.');
