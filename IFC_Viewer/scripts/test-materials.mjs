import assert from 'node:assert/strict';
import {readRows,tableRows,exportText} from '../.cache/material-data.js';
function attr(value,type){return {value,type};}
function item(n,category,attributes={},relations={}){return {_localId:attr(n),_category:attr(category),...Object.fromEntries(Object.entries(attributes).map(([k,v])=>[k,attr(...(Array.isArray(v)?v:[v]))])),...relations};}
const metre=item(12,'IFCSIUNIT',{UnitType:'LENGTHUNIT',Name:'METRE'});
const kg=item(13,'IFCSIUNIT',{UnitType:'MASSUNIT',Name:'GRAM',Prefix:'KILO'});
const length=item(3,'IFCPROPERTYSINGLEVALUE',{Name:'Length',NominalValue:[10,'IFCLENGTHMEASURE']});
const weight=item(4,'IFCPROPERTYSINGLEVALUE',{Name:'Weight',NominalValue:[5,'IFCMASSMEASURE']});
const set=item(2,'IFCPROPERTYSET',{Name:'Example'},{HasProperties:[length,weight]});
const root=item(1,'IFCBEAM',{Name:'Example beam'},{IsDefinedBy:[set]});
const assignment=item(11,'IFCUNITASSIGNMENT',{}, {Units:[metre,kg]});
const project=item(10,'IFCPROJECT',{}, {UnitsInContext:[assignment]});
const fixtureItems=[root,set,length,weight,project,assignment,metre,kg];
const fake={getItemsIdsWithGeometry:()=>[1],getItemsOfCategories:()=>({IFCPROJECT:[10]}),getItemsData:ids=>ids.map(n=>fixtureItems.find(i=>i._localId.value===n))};
assert.equal((await readRows(fake,'fixture.ifc'))[0].values.length,10);
metre.Prefix=attr('MILLI');assert.equal((await readRows(fake,'fixture.ifc'))[0].values.length,.01);
const unsupported=item(20,'IFCCONTEXTDEPENDENTUNIT',{UnitType:'LENGTHUNIT',Name:'UNKNOWN'});length.Unit=[unsupported];fixtureItems.push(unsupported);
assert.equal((await readRows(fake,'fixture.ifc'))[0].values.length,undefined,'Unsupported explicit units must not fall back to project units');
assert.equal((await readRows(fake,'fixture.ifc'))[0].values['Example · Length'],10,'Raw value stays available');
const sorted=tableRows([{id:1,values:{weight:10},sources:{}},{id:2,values:{weight:2},sources:{}},{id:3,values:{},sources:{}}],[],'','weight',false);assert.deepEqual(sorted.map(r=>r.ids[0]),[2,1,3]);
console.log('Unit, missing-value and numeric-sort tests passed.');

const materialRows=[{id:1,values:{section:'A',weight:5,length:2,name:'First'},sources:{}},{id:2,values:{section:'A',length:3,name:'Second'},sources:{}}];
const grouped=tableRows(materialRows,['section'],'','section',false)[0];assert.equal(grouped.values.length,5);assert.equal(grouped.values.weight,undefined);assert.equal(grouped.values.quantity,2);
assert.equal(tableRows(materialRows,[],'Second','name',false).length,1);
const csv=exportText([{ids:[1],values:{name:'=formula,"quoted"\nline'}}],['name'],'csv');assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('""quoted""'));assert.ok(csv.includes("'=formula"));
console.log('Grouping, filtering and CSV export tests passed.');

const missing=await readRows({...fake,getItemsIdsWithGeometry:()=>[999,1]},'fixture.ifc');
assert.equal(missing.length,2,'Missing metadata must not remove geometry from the schedule');
assert.equal(missing[0].id,999);assert.equal(missing[0].values.quantity,1);
assert.equal(missing[1].values.name,'Example beam');
assert.ok(exportText([],['=unsafe property'],'csv').includes("'=unsafe property"),'Property names in export headers must also be formula-safe');
console.log('Missing metadata and export-header regression tests passed.');
