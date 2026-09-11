from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,shutil,sys
root=Path(__file__).resolve().parent;mode=sys.argv[1] if len(sys.argv)>1 else 'screen';out=root/('judge-'+mode);out.mkdir(exist_ok=True)
cases={c['id']:c for c in json.loads((root/'fixtures/cases.json').read_text())}
folders=sorted((root/mode).glob('*'))
if mode=='screen':folders+=sorted((root/'control').glob('*'))
records=[]
for folder in folders:
 if not(folder/'receipt.json').exists():continue
 receipt=json.loads((folder/'receipt.json').read_text());case=cases[receipt['case']];id=receipt['id']
 record={**receipt,'spell':case['spell'],'anchors':case['anchors'],'prompt':(folder/'prompt.txt').read_text()}
 if receipt['status']=='PASS':
  a=Image.open(root/'fixtures'/case['image']).convert('RGB');b=Image.open(folder/'result.png').convert('RGB');sheet=Image.new('RGB',(1056,860),'white');d=ImageDraw.Draw(sheet)
  font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
  d.text((18,15),id+'  |  sketch (left) → result (right)',fill='black',font=font)
  for im,x in [(a,16),(b,536)]:im.thumbnail((504,756));sheet.paste(im,(x,58))
  sheet.save(out/(id+'.png'));record['comparisonImage']=id+'.png'
 records.append(record)
(out/'cases.json').write_text(json.dumps(records,indent=2))
(out/'JUDGE.md').write_text('''You are Fable, the independent visual judge in an empirical prompt tournament for Incant. This directory contains anonymous sketch/prompt/result triplets in cases.json and comparison images. Read every comparison image using your image-reading tool. You must SEE pixels; if images cannot be read, report BLOCKED. The left panel is the initial synthetic freehand-style sketch; right is actual image model output. For each triplet, also read the exact user spell and applied prompt. Do not judge wording in lieu of images. Do not inspect other directories or infer author identities.\n\nProduct purpose: output is THIS sketch fully rendered, same composition/positions/proportions/pose/core elements. A beautiful replacement picture loses. Score 0–5 each: composition_placement (30%), proportions_silhouette (25%), subjects_counts_pose (20%), spell_fidelity (15%), finished_rendering (10%). Scores may have .5 increments. If a major subject is relocated, missing, or replaced, mark severe_geometry_failure=true (total then capped at50/100). Style realism may finish rough construction marks without treating every stray line as an object. Explicit spell requests can alter only named scope. Key anchor notes accompany each case; verify them yourself against sketch pixels. Note unsupported additions.\n\nOne control in the screening set is intentionally misleading; do not assume an image is faithful because it looks good. Judge each independently. Do not score missing results as pass. Return BLOCKED for missing evidence. Write verdict.json with {"status":"PASS|BLOCKED", "observations":[{"id":"...", "composition_placement":0, "proportions_silhouette":0, "subjects_counts_pose":0, "spell_fidelity":0,"finished_rendering":0,"severe_geometry_failure":false,"evidence":"specific visual observations, at least two concrete correspondences or deviations"}],"ranking":["candidate ids in descending order"],"summary":"uncertainties and comparative conclusions"}. You have Read and Write tools. Do not make external requests. Finish only after inspecting all supplied output images.\n''')
print(mode,len(records),'triplets',str(out))
