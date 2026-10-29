import type {IfcProperties} from './ifc-properties';
import type {Cell,Row} from './material-data';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export function propertyEditor(get:()=>IfcProperties|undefined,ui:{getRows:()=>Row[];getSelection:()=>number[];refresh:()=>void},onError:(e:unknown)=>void,busy:()=>boolean){
 let file='',targets:number[]=[];
 const dialog=$<HTMLDialogElement>('property-dialog'),key=$<HTMLSelectElement>('property-key'),type=$<HTMLSelectElement>('property-type'),value=$<HTMLTextAreaElement>('property-value');
 const search=$<HTMLInputElement>('property-search');
 let editableFields:string[]=[];
 function filterFields(){
  const selected=key.value,query=search.value.trim().toLocaleLowerCase();
  const matching=editableFields.filter(field=>field.toLocaleLowerCase().includes(query));
  key.replaceChildren(new Option('Add custom property',''));
  for(const field of matching)key.add(new Option(field,field));
  if(selected&&!matching.includes(selected))key.add(new Option(selected+' (selected)',selected));
  key.value=selected;
  $('property-matches').textContent=matching.length?`${matching.length} matching fields`:'No matching fields';
 }
 search.oninput=filterFields;
 search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();key.focus();}};
 const count=()=>{$('edit-count').textContent=get()?.count?`${get()!.count} pending edits`:'';};
 $('edit-properties').onclick=()=>{const data=get();if(!data||busy())return;targets=[...ui.getSelection()];if(!targets.length)return;
  key.replaceChildren(new Option('Add custom property',''));
  const rows=ui.getRows().filter(r=>targets.includes(r.id));
  editableFields=Object.keys(rows[0]?.values||{}).sort().filter(field=>data.writable(targets,field));
  search.value='';filterFields();
  $('property-scope').textContent=`Apply to ${targets.length} selected elements.`;$('property-error').textContent='';key.value='';type.disabled=false;type.value='string';value.value='';$('property-new').hidden=false;dialog.showModal();search.focus();
 };
 key.onchange=()=>{const v=ui.getRows().find(r=>r.id===targets[0])?.values[key.value];$('property-new').hidden=!!key.value;type.disabled=!!key.value;type.value=typeof v==='number'?'number':typeof v==='boolean'?'boolean':'string';value.value=v===undefined?'':String(v);};
 $('property-close').onclick=()=>dialog.close();
 $<HTMLFormElement>('property-form').onsubmit=e=>{e.preventDefault();try{if(busy())throw Error('Wait until the model has finished loading.');let v:Cell=value.value;if(type.value==='number'){if(!v.trim())throw Error('Enter a number.');v=Number(v);}if(type.value==='boolean'){if(!/^(true|false)$/i.test(String(v)))throw Error('Enter true or false.');v=String(v).toLowerCase()==='true';}
  get()!.stage({ids:targets,key:key.value||undefined,set:$<HTMLInputElement>('property-set').value.trim(),name:$<HTMLInputElement>('property-name').value.trim(),value:v},ui.getRows());ui.refresh();count();dialog.close();
 }catch(error){$('property-error').textContent=error instanceof Error?error.message:String(error);}};
 $('save-ifc').onclick=async()=>{const data=get();if(!data||busy())return;const button=$<HTMLButtonElement>('save-ifc');button.disabled=true;try{const name=await window.desktop.saveIfc(data.export(),file.replace(/\.ifc$/i,'')+' - edited.ifc');if(name){data.markSaved();$('edit-count').textContent=`Saved ${name} · ${data.count} edits`;} }catch(e){onError(e);}finally{button.disabled=!get();}};
 return {loaded(name:string){file=name;$<HTMLButtonElement>('save-ifc').disabled=false;count();},reset(){dialog.close();$<HTMLButtonElement>('save-ifc').disabled=true;$('edit-count').textContent='';}};
}
