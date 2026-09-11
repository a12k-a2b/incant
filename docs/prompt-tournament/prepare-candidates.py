from pathlib import Path
import json,re,hashlib
r=Path(__file__).resolve().parent
names=['grok-render','sol-fidelity','official-adapted','grok-minimal','current-incant','sol-completion','grok-geometry']
prompts={}
for name in ['grok-render','grok-minimal','grok-geometry']:
 data=json.loads((r/'receipts'/(name+'-v2')/'stdout.txt').read_text())
 assert data.get('stopReason')=='EndTurn',name
 t=data['text'].strip();t=re.sub(r'^```(?:json)?\s*|\s*```$','',t)
 parsed,_=json.JSONDecoder().raw_decode(t[t.index('{'):]);parsed['prompt']=parsed['prompt'].replace('\\n','\n');prompts[name]=parsed['prompt'];(r/(name+'.txt')).write_text(parsed['prompt']);(r/(name+'.md')).write_text(parsed['rationale'])
for name in ['sol-fidelity','sol-completion']:prompts[name]=(r/(name+'.txt')).read_text()
prompts['official-adapted']='Render the supplied drawing as a complete finished image. Keep its composition, relative dimensions, and viewpoint unchanged. Apply suitable surfaces and illumination according to this request: {{SPELL}}. Do not introduce additional subjects or lettering.'
prompts['current-incant']='Turn this drawing into a complete, finished image.\nPreserve the exact layout, proportions, perspective, and placement of every element in the sketch.\nTreat the sketch as the compositional guide — do not invent new major subjects or rearrange the scene.\nThe caster\'s spell (follow this for style, setting, materials, lighting, and extra detail):\n{{SPELL}}\nDo not add text, watermarks, captions, or UI unless the spell explicitly asks for lettering.'
candidates=[]
for i,name in enumerate(names):
 candidates.append({'id':f'P{i+1:02}','template':prompts[name]+'\nUse clear silhouettes and value contrast so the image remains legible on a grayscale display.'})
(r/'candidates.json').write_text(json.dumps(candidates,indent=2));(r/'author-map.json').write_text(json.dumps({f'P{i+1:02}':name for i,name in enumerate(names)},indent=2))
print('Prepared',len(candidates),'candidates')
