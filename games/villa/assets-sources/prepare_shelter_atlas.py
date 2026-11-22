"""Offline reproduction. Three native donors. Use pinned local originals only."""
import argparse, base64, hashlib, io, math, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HASHES = {
 'fern_02_diff_1k.jpg':'a828a6e7b4c01c826911e2eac4b3afc7457dab7b3b392a31c681ed88b7d50029',
 'fern_02_alpha_1k.png':'ea3c64284c7ebdeedf484d2d816eae92825ec526140c3bb83859ddc7a64001f9',
 'shrub_02_diff_1k.jpg':'9956eff294034d70516d867e9668428a23d782feb3d4c34061dce5e44bacd5a8',
 'shrub_02_alpha_1k.png':'5c2c31bac311051db77443e1780078403c2df0a832c40fe6ed7bcd982695cdf0',
 'island_tree_02_leaves_diff_1k.jpg':'f56d762a1507754752abf164cc12acbc1e87ce87fa609ac44b98a1b0037c89d8',
 'island_tree_02_leaves_alpha_1k.png':'f4341f147988dbe6b58d9ca841a8f0e4bcff25bc40d05f9877da82006d489c39',
 'island_tree_02_branches_diff_1k.jpg':'bee5ec22196e9e31ad0c95a5a9b4636571cc0124d5bb27a92f1e307d289cc60d',
}
RESAMPLE=Image.Resampling.LANCZOS

def source(dir,name):
    data=(dir/name).read_bytes()
    if hashlib.sha256(data).hexdigest()!=HASHES[name]: raise ValueError(name)
    im=Image.open(io.BytesIO(data)); im.load(); assert im.size==(1024,1024);return im

def surface(dir,name,scale,offset):
    im=np.asarray(source(dir,name+'_diff_1k.jpg').convert('RGB')).astype('float32')
    im=Image.fromarray(np.uint8(np.clip(im*np.array(scale)+offset,0,255))).convert('RGBA')
    alpha=np.asarray(source(dir,name+'_alpha_1k.png')); assert alpha.dtype==np.uint16
    im.putalpha(Image.fromarray(np.uint8(np.rint(alpha/257)))); return im

def shoot(sheet,variant):
    # Photographed single leaf blades; these are local twig charts, never plant or crown renders.
    rng=random.Random(1937+137*variant);s=2;w,h=128*s,256*s
    out=Image.new('RGBA',(w,h));draw=ImageDraw.Draw(out);cx=w*.5; lean=rng.uniform(-.1,.1)*w
    def stalk(t):return (cx+lean*t+math.sin(t*4.7+variant)*w*.056*t, h*(.988-.91*t))
    for i in range(12):draw.line([stalk(i/12),stalk((i+1)/12)],fill=(89,91,56,255),width=max(1,round(s*(2.8-2.2*i/12))))
    boxes=[(12,15,152,523),(161,11,353,405),(365,20,510,376),(523,45,679,374),(704,15,844,426)]
    def blade(base,angle,length,width,index):
        leaf=sheet.crop(boxes[index%len(boxes)]).resize((max(4,round(width)),round(length)),RESAMPLE)
        # Pivot at the photographed blade base; padding is only for offline rotation.
        n=round(length*2.7);center=n//2;patch=Image.new('RGBA',(n,n));patch.paste(leaf,(center-leaf.width//2,center-leaf.height))
        patch=patch.rotate(-math.degrees(angle),Image.Resampling.BICUBIC,center=(center,center));out.alpha_composite(patch,(round(base[0])-center,round(base[1])-center))
    # A bifurcating twig with 7-8 smaller alternate shoots. Do not enlarge individual leaves
    # to bulk out the crown: the characteristic blade is only 1/8–1/5 of this local shoot.
    for i in range(7+variant%2):
        t=.065+i*.111+rng.uniform(0,.021);side=(-1 if (i+variant)%2 else 1);x,y=stalk(t)
        dx=side*rng.uniform(24,36)*s*(1-.38*t);dy=-rng.uniform(29,42)*s*(1-.39*t)
        for seg in range(3):
            u=seg/3;v=(seg+1)/3;draw.line([(x+dx*u,y+dy*u*u),(x+dx*v,y+dy*v*v)],fill=(104,102,63,255),width=3 if seg==0 else 2)
        for k in range(6):
            u=.14+.157*k+rng.uniform(-.035,.035);base=(x+dx*u,y+dy*u*u)
            a=side*math.radians(rng.uniform(32,65)+(19 if k%2 else -31));le=s*rng.uniform(31,45)*(1-.24*t)
            if k%2: a=side*math.radians(rng.uniform(70,107));le*=.82
            # Limit only the outer blade's extent; don't trim a blade at the atlas border.
            le=min(le,max(s*13,(w-4-base[0] if a>0 else base[0]-4)/max(.01,abs(math.sin(a)))))
            blade(base,a,le,le*rng.uniform(.34,.48),i*3+k+variant)
    x,y=stalk(.94);blade((x,y),rng.uniform(-.35,.35),s*21,s*8,variant+1)
    return out.resize((128,256),RESAMPLE)

def packbits(data):
    out=bytearray();i=0;literal=bytearray()
    def flush():
        if literal:out.append(len(literal)-1);out.extend(literal);literal.clear()
    while i<len(data):
        j=i+1
        while j<min(len(data),i+128) and data[j]==data[i]:j+=1
        if j-i>=3:flush();out.extend((128+j-i-1,data[i]));i=j
        else:
            literal.append(data[i]);i+=1
            if len(literal)==128:flush()
    flush();return out

def encode(im):
    raw=np.array(im.convert('RGBA'));alpha=raw[:,:,3];raw[alpha<11]=(79,99,55,0)
    # Keep up to four true edge coverage levels. Transparent texels are green matte to avoid dark mips.
    raw[:,:,3]=np.uint8(np.rint(raw[:,:,3]/85)*85);raw[raw[:,:,3]==0]=(79,99,55,0)
    q=Image.fromarray(raw).quantize(256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
    ids=np.asarray(q);out=np.asarray(q.convert('RGBA'));p=np.zeros((256,4),np.uint8)
    unique,offsets=np.unique(ids.ravel(),return_index=True);p[unique]=out.reshape(-1,4)[offsets]
    return p.tobytes()+bytes(packbits(ids.tobytes()))

def build(dir):
    atlas=Image.new('RGBA',(1024,512));atlas.paste(surface(dir,'fern_02',[.95,1.09,.98],[3,3,11]).resize((512,512),RESAMPLE),(0,0));atlas.paste(surface(dir,'shrub_02',[.92,1.08,1.01],[3,6,4]).resize((256,512),RESAMPLE),(512,0))
    leaves=surface(dir,'island_tree_02_leaves',[.84,1.08,.95],[5,6,16]);
    for i in range(4):atlas.paste(shoot(leaves,i),(768+(i%2)*128,(i//2)*256))
    bark=source(dir,'island_tree_02_branches_diff_1k.jpg').convert('RGBA').resize((128,128),RESAMPLE)
    out='// Generated offline from CC0 Poly Haven scan materials; see ../assets-sources/SHELTER-PLANTING.md.\n'
    for name,im in [('SHELTER_LEAF_ATLAS',atlas),('SHELTER_BARK',bark)]:
        data=encode(im);print(name,im.size,len(data),'B',hashlib.sha256(data).hexdigest());out+=f"export const {name} = '{base64.b64encode(data).decode()}';\n"
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('originals',type=Path);p.add_argument('--write',action='store_true');a=p.parse_args();v=build(a.originals);dest=Path(__file__).resolve().parents[1]/'src/villaShelterPlantingAtlas.ts'
    if a.write:dest.write_text(v)
    elif v!=dest.read_text():raise SystemExit('atlas differs')
