import os, subprocess, pathlib, concurrent.futures
root=pathlib.Path(__file__).resolve().parent
logger='/Users/anjan/.codex/skills/trio-institution/scripts/trio_log.py'
def run(name):
 lane=root/'lanes'/name
 env=os.environ.copy()
 for k in ('XAI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL'):env.pop(k,None)
 env['GROK_HEAVY_NO_TOOLS_EXPECTED']='1';env['GROK_HEAVY_LEDGER']=str(root/'receipts'/(name+'-ledger.jsonl'))
 cmd=['python3',logger,'run','--db',str(root/'receipts'/'events.sqlite'),'--task-id','incant-prompts','--run-id',name+'-v2','--model','grok-4.6','--family','xai','--role','competitor','--effort','high','--packet',str(lane/'PROMPT.txt'),'--cwd',str(lane),'--out-dir',str(root/'receipts'/(name+'-v2')),'--isolation','source-free prompt-only independent process','--timeout','1200','--','/Users/anjan/code/grok-heavy','-m','grok-4.6','--reasoning-effort','high','--prompt-file',str(lane/'PROMPT.txt'),'--output-format','json','--verbatim','--no-memory','--no-subagents','--no-plan','--disable-web-search','--tools','','--permission-mode','dontAsk']
 p=subprocess.run(cmd,env=env,capture_output=True,text=True)
 print(name,p.returncode,p.stdout[-700:],p.stderr[-700:],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(run,['grok-geometry','grok-render','grok-minimal']))
