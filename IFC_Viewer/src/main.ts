import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import { LodMode, RenderedFaces, type FragmentsModel } from '@thatopen/fragments';
import CameraControls from 'camera-controls';
import * as WEBIFC from 'web-ifc';
import './style.css';
import { createGridLabels } from './grid-labels';
import { setBaseGridOnly } from './grid-visibility';
import { IfcProperties } from './ifc-properties';
import { propertyEditor } from './property-editor';
import type {Row} from './material-data';
import { materialUI } from './material-ui';
import { DisplayState, displayDelta, type DisplayPlan, type DisplayAction } from './display-state';
declare const __APP_VERSION__: string;
document.getElementById('app-version')!.textContent='v'+__APP_VERSION__;
document.title='IFC Viewer v'+__APP_VERSION__;
type LocalFile = { name: string; size: number; bytes: Uint8Array };
declare global {
  interface Window {
    desktop: { saveIfc(bytes:Uint8Array,name:string):Promise<string|null>; saveExport(format:'csv'|'txt',text:string,name:string):Promise<string|null>; openFile(): Promise<LocalFile | null>; droppedFile(file: File): Promise<LocalFile>; testRead?: (path: string) => Promise<LocalFile> };
    viewerTest?: Record<string, unknown>;
  }
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $('viewport');
const openButton = $<HTMLButtonElement>('open');
const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('nav button')];
let busy = false;
let model: FragmentsModel | undefined;
let bounds = new THREE.Box3();
let currentView = 'iso';
let components: OBC.Components;
let fragments: OBC.FragmentsManager;
let loader: OBC.IfcLoader;
let world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>;
let loadNumber = 0;
let selectionToken = 0;
let selectionWork = Promise.resolve();
const displayState = new DisplayState();
let appliedDisplay:DisplayPlan|undefined;
let pickToken=0;
let choosing=false;
let displayDirty=false;
let selectionBox = new THREE.Box3();
let selectionKey = '';
let grids: THREE.Group | undefined;
let gridLabels: ReturnType<typeof createGridLabels> | undefined;
let levels: {name:string;ids:number[];input:HTMLInputElement}[] = [];
const dataUI = materialUI(selectMembers, () => { world?.renderer?.resize(); }, showError, displayState, changeDisplay);
let propertyData:IfcProperties|undefined;
const editor=propertyEditor(()=>propertyData,dataUI,showError,()=>busy);
dataUI.reset();
async function updateDisplay(displayChanged=false) {
 displayDirty ||= displayChanged;
 const token=++selectionToken, target=model;
 // Serialize model changes and skip superseded work, including during replacement.
 selectionWork=selectionWork.catch(()=>{}).then(async()=>{
  if(!target||target!==model||token!==selectionToken)return;
  const plan=displayState.plan();
  try {
   if(!appliedDisplay){await target.resetHighlight();await target.setVisible(undefined,true);}
   const delta=displayDelta(appliedDisplay??{hidden:[],batches:[]},plan);
   if(delta.reset.length)await target.resetHighlight(delta.reset);
   if(delta.show.length)await target.setVisible(delta.show,true);
   if(delta.hide.length)await target.setVisible(delta.hide,false);
   for(const batch of delta.batches)await target.highlight(batch.ids,{color:new THREE.Color(batch.colour),renderedFaces:RenderedFaces.TWO,opacity:1,transparent:false});
   appliedDisplay=plan;
  }catch(error){appliedDisplay=undefined;throw error;}
  if(target!==model||token!==selectionToken)return;
  dataUI.setSelection(displayState.selected,displayDirty);displayDirty=false;
  const ids=displayState.selected.filter(id=>!displayState.hidden.has(id));
  const key=ids.join(',');
  if(key!==selectionKey){
   const box=ids.length?await target.getMergedBox(ids):new THREE.Box3();
   if(target!==model||token!==selectionToken)return;
   selectionKey=key;selectionBox.copy(box);
   setSelectionPivot();
  }
  syncVisibilityControls(); controlsEnabled(); await fragments.core.update(true);
 });
 return selectionWork;
}
async function selectMembers(ids:number[]) {
 if(busy||!model)return;
 ++pickToken;
 displayState.selected=[...new Set(ids)];
 return updateDisplay();
}
async function changeDisplay(action:DisplayAction){
 if(busy||!model)return;
 displayState.change(action);
 return updateDisplay(true);
}
function controlsEnabled() {
  openButton.disabled = busy;
  for (const b of viewButtons) b.disabled = busy || !model;
  $<HTMLButtonElement>('focus-selection').disabled=busy||!model||selectionBox.isEmpty();
  $<HTMLInputElement>('gridlines').disabled=busy||!grids?.children.length;
  $<HTMLInputElement>('grid-names').disabled=busy||!gridLabels?.count;
  $<HTMLInputElement>('base-grid-only').disabled=busy||!grids?.children.length;
  for(const level of levels)level.input.disabled=busy;
}
function setSelectionPivot(){
 if(selectionBox.isEmpty())return;
 const center=selectionBox.getCenter(new THREE.Vector3());
 world.camera.controls.setOrbitPoint(center.x,center.y,center.z);
}
function syncVisibilityControls(){
 for(const level of levels){
  const count=level.ids.filter(id=>displayState.hidden.has(id)).length;
  level.input.checked=count<level.ids.length;level.input.indeterminate=count>0&&count<level.ids.length;
 }
}
async function prepareVisibility(target:FragmentsModel){
 const geometry=new Set(await target.getItemsIdsWithGeometry());
 const tree=await target.getSpatialStructure();
 const storeys: {id:number;ids:number[]}[]=[];
 function visit(node:typeof tree):number[]{
  const ids=[...(node.localId!==null&&geometry.has(node.localId)?[node.localId]:[]),...(node.children??[]).flatMap(visit)];
  if(node.category==='IFCBUILDINGSTOREY'&&node.localId!==null)storeys.push({id:node.localId,ids:[...new Set(ids)]});
  return ids;
 }
 visit(tree);
 const data=await target.getItemsData(storeys.map(s=>s.id),{attributesDefault:true});
 const options=$('level-options');options.replaceChildren();
 levels=storeys.map((storey,index)=>{
  const item=data.find(item=>{const id=item._localId;return id&&!Array.isArray(id)&&id.value===storey.id;});
  const attr=item?.Name;
  const name=String(attr&&!Array.isArray(attr)?attr.value:`Level ${index+1}`);
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;
  label.append(input,document.createTextNode(name));options.append(label);
  input.addEventListener('change',()=>{void changeDisplay({kind:'visibility',ids:storey.ids,visible:input.checked}).catch(showError);});
  return {name,ids:storey.ids,input};
 });
 if(!levels.length)options.textContent='No levels in this IFC.';
 grids=await target.getGrids();
 target.getGridMaterial().color.set('#526d7b');
 target.object.add(grids);
 gridLabels=createGridLabels(grids);
 $<HTMLInputElement>('base-grid-only').checked=true;
 setBaseGridOnly(grids,true);
 const namesInput=$<HTMLInputElement>('grid-names');namesInput.checked=true;
 const gridInput=$<HTMLInputElement>('gridlines');gridInput.checked=true;
 $('grid-note').textContent=grids.children.length?'':'(none in this IFC)';
}
async function focusSelection(){
 if(busy||!model||selectionBox.isEmpty())return;
 await orient(undefined,true,selectionBox);
}
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/memory|allocation|out of bounds/i.test(message)) return 'There is not enough memory to open this model. Close other large models or try a smaller IFC export.';
  return message || 'The IFC file could not be read. Try exporting it again from the source application.';
}
function showError(error: unknown) {
  $('error-text').textContent = errorMessage(error);
  $('error').hidden = false;
}
function loading(text: string, percent?: number) {
  $('load-detail').textContent = text;
  const bar = $<HTMLProgressElement>('progress');
  if (percent === undefined) bar.removeAttribute('value'); else bar.value = percent;
}
function sizeLabel(n: number) { return n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`; }
async function clearModel() {
  propertyData?.close();propertyData=undefined;editor.reset();
  ++selectionToken;
  ++pickToken;
  await selectionWork.catch(()=>{});
  appliedDisplay=undefined;
  displayState.reset();
  gridLabels?.dispose();gridLabels=undefined;
  selectionBox.makeEmpty();selectionKey='';grids=undefined;levels=[];
  $('level-options').textContent='Open an IFC to see its levels.';
  $('grid-note').textContent='';
  dataUI.reset();
  model = undefined;
  for (const id of [...fragments.list.keys()]) await fragments.core.disposeModel(id);
  // A replacement model must not inherit a previous IFC's georeferencing transform.
  fragments.baseCoordinationModel = '';
  fragments.baseCoordinationMatrix.identity();
  bounds.makeEmpty();
  document.title='IFC Viewer';
  $('filename').textContent = 'No model open';
  $('file-meta').textContent = 'Ready';
  $('status-dot').classList.remove('loaded');
  $('empty').hidden = false;
  controlsEnabled();
}
async function orient(view?: string, smooth = true, fitBounds=bounds) {
  if (!model || bounds.isEmpty()) return;
  if (view) currentView = view;
  const camera = world.camera;
  // Perspective navigation works consistently with orbit and zoom-to-pointer.
  const center = fitBounds.getCenter(new THREE.Vector3());
  const radius = Math.max(fitBounds.getSize(new THREE.Vector3()).length() / 2, 0.01);
  const directions: Record<string, THREE.Vector3> = {
    iso: new THREE.Vector3(1, 0.7, 1), front: new THREE.Vector3(0, 0, 1),
    side: new THREE.Vector3(1, 0, 0), top: new THREE.Vector3(0, 1, 0.00001),
  };
  const dir = view ? directions[view].clone() : camera.three.position.clone().sub(camera.controls.getTarget(new THREE.Vector3()));
  const perspective = camera.three as THREE.PerspectiveCamera;
  const vertical = THREE.MathUtils.degToRad(perspective.fov || 50);
  const aspect = Math.max(viewport.clientWidth / viewport.clientHeight, 0.1);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.18;
  const pos = center.clone().addScaledVector(dir.normalize(), distance);
  await camera.controls.setFocalOffset(0,0,0,smooth);
  await camera.controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, smooth);
  setSelectionPivot();
  for (const b of viewButtons) b.classList.toggle('active', b.dataset.view === currentView);
  await fragments.core.update(true);
}
function validateIfc(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 16384)));
  const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 65536)));
  if (!/ISO-10303-21\s*;/i.test(header) || !/FILE_SCHEMA\s*\(/i.test(header)) throw new Error('This file is not a readable IFC STEP model. Choose an uncompressed .ifc file.');
  if (!/END-ISO-10303-21\s*;/i.test(tail)) throw new Error('This IFC file appears incomplete. Export or download the complete file and try again.');
}
async function openModel(file: LocalFile) {
  if (busy) return;
  busy = true;
  controlsEnabled();
  $('error').hidden = true;
  $('loading').hidden = false;
  $('load-title').textContent = `Opening ${file.name}`;
  loading('Checking file…');
  const start = performance.now();
  try {
    if (!/\.ifc$/i.test(file.name)) throw new Error('Choose a file with an .ifc extension.');
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    validateIfc(bytes);
    await clearModel();
    loading('Reading IFC geometry…', 0);
    await new Promise(resolve => requestAnimationFrame(resolve));
    model = await loader.load(bytes, false, `local-${++loadNumber}`, {
      processData: { progressCallback: (progress: number) => loading(`Reading IFC… ${Math.round(progress * 100)}%`, Math.min(90, progress * 90)) },
    });
    model.useCamera(world.camera.three);
    model.graphicsQuality = 1;
    world.scene.three.add(model.object);
    // Import IFC in stable local coordinates, then centre the complete model.
    model.object.updateMatrixWorld(true);
    const initialBox = model.box.clone();
    if (initialBox.isEmpty() || ![...initialBox.min.toArray(),...initialBox.max.toArray()].every(Number.isFinite)) throw new Error('No displayable 3D geometry was found in this IFC file.');
    const center = initialBox.getCenter(new THREE.Vector3());
    model.object.position.sub(center);
    model.object.updateMatrixWorld(true);
    bounds.copy(initialBox).translate(center.negate());
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, .01);
    world.camera.three.near = Math.max(.0001, radius / 10000);
    world.camera.three.far = Math.max(1000, radius * 200);
    world.camera.three.updateProjectionMatrix();
    world.camera.controls.minDistance = Math.max(.001, radius / 10000);
    world.camera.controls.maxDistance = radius * 100;
    loading('Preparing view…', 95);
    try { await prepareVisibility(model); } catch(error) {
      $('level-options').textContent='Level or gridline information could not be read.';
      console.warn('IFC visibility controls unavailable',error);
    }
    // Small steel details must remain full geometry rather than LOD lines.
    await model.setLodMode(LodMode.ALL_GEOMETRY);
    await orient('iso', false);
    await fragments.core.update(true);
    $('empty').hidden = true;
    $('filename').textContent = file.name;
    $('file-meta').textContent = `${sizeLabel(file.size)} · ${((performance.now() - start) / 1000).toFixed(1)} s`;
    $('status-dot').classList.add('loaded');
    document.title = `${file.name} — IFC Viewer`;
    viewport.focus();
    loading('Reading member information…', 98);
    try {
      const rows:Row[]=(await model.getItemsIdsWithGeometry()).map(id=>({id,values:{file:file.name},sources:{}}));
      propertyData=await IfcProperties.open(bytes);
      propertyData.discover(rows);
      dataUI.setRows(rows,file.name);editor.loaded(file.name);
      await orient('iso',false);
    } catch(error){dataUI.status('Member information could not be read. '+errorMessage(error));}
  } catch (error) {
    // Leave a successfully loaded model visible if validation failed before replacement.
    if (fragments.list.size && !model) await clearModel();
    if (model && $('empty').hidden === false) await clearModel();
    showError(error);
  } finally {
    busy = false;
    $('loading').hidden = true;
    controlsEnabled();
  }
}
async function chooseFile() {
  if (busy||choosing) return;
  choosing=true;
  try { const file = await window.desktop.openFile(); if (file) await openModel(file); }
  catch (error) { showError(error); }
  finally { choosing=false; }
}
async function init() {
  components = new OBC.Components();
  world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>();
  world.scene = new OBC.SimpleScene(components);
  world.scene.setup();
  world.scene.three.background = new THREE.Color('#edf0f2');
  world.renderer = new OBC.SimpleRenderer(components, viewport, { antialias: true, alpha: false });
  world.renderer.showLogo = false;
  world.renderer.three.setPixelRatio(Math.min(devicePixelRatio, 2));
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  components.init();
  const controls = world.camera.controls;
  controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.middle = CameraControls.ACTION.TRUCK;
  controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controls.dollyToCursor = true;
  controls.infinityDolly = false;
  controls.smoothTime = .14;
  await controls.setLookAt(10, 7, 10, 0, 0, 0, false);
  fragments = components.get(OBC.FragmentsManager);
  fragments.init(new URL('vendor/fragments-worker.mjs', document.baseURI).href);
  controls.addEventListener('update', () => { void fragments.core.update(); });
  controls.addEventListener('controlstart',()=>{if(!busy)setSelectionPivot();});
  fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
    if (!('isLodMaterial' in material && material.isLodMaterial)) {
      material.polygonOffset = true;
      material.polygonOffsetUnits = 1;
      material.polygonOffsetFactor = 1;
    }
  });
  loader = components.get(OBC.IfcLoader);
  await loader.setup({ autoSetWasm: false, wasm: { path: new URL('vendor/', document.baseURI).href, absolute: true }, webIfc: { COORDINATE_TO_ORIGIN: true } });
  loader.onIfcImporterInitialized.add(importer => {
    importer.doubleSidedMaterials = true;
    importer.distanceThreshold = null;
    importer.parseOnce = true;
    importer.addAllAttributes();
    // Explicitly retain structural and connection classes, including small accessories.
    for (const id of [WEBIFC.IFCBEAM, WEBIFC.IFCCOLUMN, WEBIFC.IFCMEMBER, WEBIFC.IFCPLATE, WEBIFC.IFCBUILDINGELEMENTPROXY, WEBIFC.IFCFASTENER, WEBIFC.IFCMECHANICALFASTENER, WEBIFC.IFCDISCRETEACCESSORY, WEBIFC.IFCFOOTING]) importer.classes.elements.add(id);
  });
  let down:{x:number;y:number;time:number;moved:boolean}|undefined;
  viewport.addEventListener('pointerdown',e=>{if(e.button===0)down={x:e.clientX,y:e.clientY,time:performance.now(),moved:false};});
  viewport.addEventListener('pointermove',e=>{if(down&&Math.hypot(down.x-e.clientX,down.y-e.clientY)>4)down.moved=true;});
  viewport.addEventListener('pointercancel',()=>{down=undefined;});
  viewport.addEventListener('pointerup',async e=>{
    const start=down;down=undefined;
    if(e.button!==0||!start||start.moved||busy||!model||Math.hypot(start.x-e.clientX,start.y-e.clientY)>4||performance.now()-start.time>800)return;
    const target=model, token=++pickToken;
    try{const hit=await target.raycast({camera:world.camera.three,mouse:new THREE.Vector2(e.clientX,e.clientY),dom:world.renderer!.three.domElement});if(target===model&&token===pickToken&&!busy)await selectMembers(hit?[hit.localId]:[]);}catch(error){showError(error);}
  });
  viewport.addEventListener('contextmenu' , e => e.preventDefault());
  $('open').addEventListener('click', () => void chooseFile());
  $('fit').addEventListener('click', () => void orient());
  $('focus-selection').addEventListener('click',()=>{void focusSelection().catch(showError);});
  $('gridlines').addEventListener('change',()=>{if(grids)grids.visible=$<HTMLInputElement>('gridlines').checked;});
  $('grid-names').addEventListener('change',()=>{gridLabels?.setVisible($<HTMLInputElement>('grid-names').checked);});
  $('base-grid-only').addEventListener('change',()=>{if(grids)setBaseGridOnly(grids,$<HTMLInputElement>('base-grid-only').checked);});
  $('dismiss').addEventListener('click', () => { $('error').hidden = true; });
  for (const b of viewButtons) if (b.dataset.view) b.addEventListener('click', () => void orient(b.dataset.view));
  document.addEventListener('keydown', e => {
    if ((e.target as HTMLElement)?.matches('input,textarea,select') || document.querySelector('dialog[open]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); void chooseFile(); }
    else if (!e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f' && !busy) { e.preventDefault(); void orient(); }
    else if (!e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'z' && !busy) { e.preventDefault(); void focusSelection().catch(showError); }
    else if (e.key === 'Escape') $('error').hidden = true;
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', e => { if(!e.dataTransfer?.types.includes('Files'))return; e.preventDefault(); dragDepth++; if (!busy && e.dataTransfer?.types.includes('Files')) $('drop').hidden = false; });
  document.addEventListener('dragover', e => { if(!e.dataTransfer?.types.includes('Files'))return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = busy ? 'none' : 'copy'; });
  document.addEventListener('dragleave', e => { if(!e.dataTransfer?.types.includes('Files'))return; e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
  document.addEventListener('drop', async e => {
    e.preventDefault(); dragDepth = 0; $('drop').hidden = true;
    if (busy) return;
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length !== 1) { showError(new Error('Open one IFC file at a time.')); return; }
    try { await openModel(await window.desktop.droppedFile(files[0])); } catch (error) { showError(error); }
  });
  window.addEventListener('beforeunload', () => { components.dispose(); });
  controlsEnabled();
  if (window.desktop.testRead) {
    window.viewerTest = {
      openPath: async (path: string) => openModel(await window.desktop.testRead!(path)),
      openBytes: async (name: string, bytes: number[]) => openModel({ name, size: bytes.length, bytes: new Uint8Array(bytes) }),
      state: () => ({ busy, models: fragments.list.size, currentView, box: { min: bounds.min.toArray(), max: bounds.max.toArray() }, camera: world.camera.three.position.toArray(), target: controls.getTarget(new THREE.Vector3()).toArray(), filename: $('filename').textContent, error: $('error').hidden ? null : $('error-text').textContent, tiles: model?.tiles.size, visibleItems: model?.visibleItems.size }),
      rows: () => dataUI.getRows(),
      select: selectMembers,
      focusSelection,
      levels:()=>levels.map(l=>({name:l.name,ids:l.ids})),
      display: () => ({hidden:[...displayState.hidden],colours:[...displayState.colours],selected:displayState.selected}),
      changeDisplay,
      geometry: async () => model ? { categories: await model.getCategories(), items: await model.getItemsIdsWithGeometry() } : null,
    };
  }
}
controlsEnabled();
init().catch(error => { showError(new Error(`The 3D viewer could not start. ${errorMessage(error)}`)); openButton.disabled = true; });
