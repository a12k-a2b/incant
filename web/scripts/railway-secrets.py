import subprocess,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
for file in ['.env','.env.access']:
 for line in (root/file).read_text().splitlines():
  if not line or line.startswith('#'):continue
  key,value=line.split('=',1)
  if key not in ['OPENAI_API_KEY','GEMINI_API_KEY','APP_ACCESS_KEY']:continue
  p=subprocess.run(['railway','variable','set',key,'--stdin','--skip-deploys','--environment','production','--service','incant-web','--project','5196b8dc-8213-41c1-9e23-72f3c68b3494'],input=value,text=True,capture_output=True)
  print(key+': '+('configured' if p.returncode==0 else 'FAILED'))
  if p.returncode:
   print((p.stderr+p.stdout).replace(value,'[REDACTED]')[-1500:]);raise SystemExit(p.returncode)
