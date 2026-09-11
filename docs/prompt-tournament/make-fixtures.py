from PIL import Image,ImageDraw
from pathlib import Path
import json,math,random
root=Path(__file__).resolve().parent/'fixtures'; random.seed(811)
W,H=768,1152
cases=[]
def setup():
 global im,d
 im=Image.new('RGB',(W,H),'#f7f3e8');d=ImageDraw.Draw(im)
def line(points,width=4):
 # Deliberately imperfect simulated pen input, not polished vector art.
 p=[(int(x*W),int(y*H)) for x,y in points];d.line(p,fill='#292820',width=width,joint='curve')
def ellipse(box,width=4):
 x1,y1,x2,y2=box;cx=(x1+x2)/2;cy=(y1+y2)/2;rx=(x2-x1)/2;ry=(y2-y1)/2
 pts=[(cx+rx*math.cos(t*math.pi/40)+random.uniform(-.0015,.0015),cy+ry*math.sin(t*math.pi/40)+random.uniform(-.0015,.0015)) for t in range(81)];line(pts,width)
def save(id,spell,anchors,phase):
 im.save(root/(id+'.png'));cases.append(dict(id=id,spell=spell,anchors=anchors,phase=phase,image=id+'.png'))
setup()
line([(.12,.61),(.15,.81),(.46,.81),(.47,.59)]);line([(.07,.6),(.24,.37),(.53,.61),(.07,.6)]);line([(.35,.46),(.35,.34),(.42,.34),(.42,.53)])
line([(.2,.81),(.2,.66),(.29,.66),(.29,.81)]);ellipse((.34,.64,.42,.7));line([(.67,.79),(.68,.56),(.73,.39),(.76,.59),(.8,.79)]);ellipse((.59,.3,.84,.58));ellipse((.71,.13,.84,.22));line([(.05,.83),(.25,.84),(.5,.82),(.9,.83)])
save('cottage','A cozy stone cottage and an old tree under the moon, rendered as a detailed watercolor storybook scene.',{'cottage':'lower left, broad asymmetrical triangular roof; door left and round window right','tree':'right of house, tall oval crown, trunk to ground','moon':'small upper right','counts':'one cottage, one tree, one moon; keep large open upper-left sky'},'screen')
setup()
ellipse((.25,.48,.7,.72));line([(.28,.56),(.15,.47),(.09,.35),(.14,.33),(.25,.42),(.34,.51)]);ellipse((.09,.28,.25,.4));ellipse((.17,.31,.185,.322));line([(.11,.29),(.09,.22),(.16,.285)]);line([(.22,.29),(.23,.22),(.25,.31)]);line([(.36,.68),(.32,.82),(.4,.82)]);line([(.6,.69),(.66,.82),(.73,.82)]);line([(.67,.61),(.82,.65),(.89,.55),(.91,.43)]);line([(.45,.52),(.44,.32),(.61,.38),(.63,.54)]);line([(.44,.32),(.51,.45),(.61,.38)])
save('dragon','Bring my small friendly dragon to life as a detailed clay creature. Keep its playful, lopsided shape and tiny folded wing.',{'pose':'head upper left, long bent neck joins large horizontal oval body','limbs':'two visible legs below body','wing':'single quadrilateral wing above middle-right body','tail':'exits right then bends upward; two small horns'},'screen')
setup()
line([(.17,.53),(.22,.77),(.5,.78),(.54,.52)]);ellipse((.17,.48,.54,.57));line([(.54,.56),(.68,.55),(.71,.63),(.66,.71),(.52,.71)]);line([(.22,.8),(.36,.81),(.55,.79)]);line([(.61,.35),(.91,.4),(.89,.56),(.61,.5),(.61,.35)]);line([(.61,.5),(.56,.55),(.88,.62),(.89,.56)]);line([(.56,.55),(.56,.62),(.88,.69),(.88,.62)]);line([(.3,.44),(.28,.4),(.32,.34),(.31,.29)])
save('cup-books','A realistic handmade ceramic tea mug beside two worn leather books, soft morning light and richly tactile surfaces.',{'mug':'large lower-left trapezoid mug with oval opening','handle':'right side mug, empty central hole','books':'two stacked books upper right, diagonal edges','steam':'one wavy line above mug, no added tabletop props'},'screen')
setup()
line([(.04,.58),(.3,.21),(.44,.49),(.6,.3),(.95,.63)]);line([(.3,.21),(.27,.42),(.34,.51)]);line([(.05,.68),(.45,.66),(.75,.71),(.96,.69)]);line([(.37,.83),(.66,.83),(.59,.9),(.43,.9),(.37,.83)]);line([(.49,.82),(.49,.53),(.63,.78),(.49,.78)]);ellipse((.77,.12,.87,.2))
save('mountain-boat','A luminous oil painting of a little sailboat on an alpine lake beneath two mountain peaks.',{'mountains':'left peak tallest, right peak shorter; same ridge shape','boat':'small below center; triangular sail points right from vertical mast','sun':'small upper right','waterline':'around two thirds down'},'final')
setup()
ellipse((.32,.4,.72,.7));line([(.32,.51),(.17,.39),(.11,.4),(.22,.6),(.33,.61)]);line([(.7,.47),(.86,.43),(.89,.57),(.81,.67),(.71,.63)]);line([(.4,.42),(.43,.35),(.61,.35),(.65,.42)]);ellipse((.49,.3,.55,.35));line([(.4,.68),(.37,.74),(.45,.74)]);line([(.61,.68),(.67,.74),(.59,.74)]);ellipse((.44,.5,.5,.56));ellipse((.56,.5,.62,.56));line([(.48,.62),(.52,.64),(.59,.6)])
save('walking-teapot','An enchanted silver teapot with a smiling face and two little feet, detailed magical realism on a simple background.',{'body':'broad round body centered below middle','spout':'long diagonal spout upper-left','handle':'loop right side, open hole','face':'two circular eyes and smile, two feet below body, lid and knob above'},'final')
(root/'cases.json').write_text(json.dumps(cases,indent=2))
