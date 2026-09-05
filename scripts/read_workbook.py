"""Read raw XLSX XML values as strings; never round through binary floats."""
import zipfile,xml.etree.ElementTree as E,json,sys,posixpath
N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def read(path,selected=None):
 z=zipfile.ZipFile(path)
 if sum(i.file_size for i in z.infolist())>450_000_000:raise ValueError('Workbook expands beyond 450 MB limit')
 ss=[]
 if 'xl/sharedStrings.xml' in z.namelist():
  for _,e in E.iterparse(z.open('xl/sharedStrings.xml'),events=['end']):
   if e.tag.endswith('}si'):ss.append(''.join(t.text or '' for t in e.iter() if t.tag.endswith('}t')));e.clear()
 wb=E.fromstring(z.read('xl/workbook.xml'));rel=E.fromstring(z.read('xl/_rels/workbook.xml.rels'));links={r.attrib['Id']:r.attrib['Target'] for r in rel};out={}
 for sh in wb.find('s:sheets',N):
  name=sh.attrib['name']
  if selected and name not in selected:continue
  target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/'+target)
  rows=[]
  for _,e in E.iterparse(z.open(target),events=['end']):
   if e.tag.endswith('}row'):
    vals=[]
    for c in e:
     ref=c.attrib.get('r','A1');col=0
     for ch in ref:
      if not ch.isalpha():break
      col=col*26+ord(ch.upper())-64
     if col>200:continue
     while len(vals)<col:vals.append('')
     v=c.find('s:v',N); inline=c.find('s:is',N)
     val=v.text or '' if v is not None else ''.join(t.text or '' for t in inline.iter() if t.tag.endswith('}t')) if inline is not None else ''
     if c.attrib.get('t')=='s':val=ss[int(val)]
     vals[col-1]=val
    rows.append({'row':int(e.attrib['r']),'values':vals});e.clear()
  out[name]=rows
 return out
if __name__=='__main__':json.dump(read(sys.argv[1],sys.argv[2:] or None),sys.stdout,separators=(',',':'))
