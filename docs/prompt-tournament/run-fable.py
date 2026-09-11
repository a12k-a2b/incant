import os,subprocess,pathlib,sys
root=pathlib.Path(__file__).resolve().parent;mode=sys.argv[1];lane=root/('judge-'+mode)
env=os.environ.copy()
for k in ['ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL','OPENAI_API_KEY','XAI_API_KEY']:env.pop(k,None)
cmd=['claude','-p','--model','claude-fable-5-1','--effort','high','--output-format','json','--safe-mode','--restricted','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence','--permission-mode','dontAsk','--tools','Read,Write','--allowedTools','Read','Write']
p=subprocess.run(cmd,input=(lane/'JUDGE.md').read_text(),text=True,cwd=lane,env=env,capture_output=True,timeout=1200)
receipt=root/'receipts'/('fable-'+mode);receipt.mkdir(exist_ok=True)
(receipt/'stdout.json').write_text(p.stdout);(receipt/'stderr.txt').write_text(p.stderr)
print('Fable',mode,'exit',p.returncode,'verdict file', (lane/'verdict.json').exists())
if p.returncode: print(p.stderr[-1000:])
