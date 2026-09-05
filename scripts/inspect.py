import zipfile,xml.etree.ElementTree as E,json,pathlib
N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def sheets(path):
 z=zipfile.ZipFile(path); ss=[]
 if 'xl/sharedStrings.xml' in z.namelist():
  for _,e in E.iterparse(z.open('xl/sharedStrings.xml'),events=['end']):
   if e.tag.endswith('}si'): ss.append(''.join(e.itertext()));e.clear()
 wb=E.fromstring(z.read('xl/workbook.xml')); rel=E.fromstring(z.read('xl/_rels/workbook.xml.rels')); links={r.attrib['Id']:r.attrib['Target'] for r in rel}
 for sh in wb.find('s:sheets',N):
  target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]; target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
  rows=[]; count=0
  for _,e in E.iterparse(z.open(target),events=['end']):
   if e.tag.endswith('}row'):
    count+=1
    if len(rows)<8:
     vals={}
     for c in e:
      v=c.find('s:v',N); val=v.text if v is not None else ''.join(c.find('s:is',N).itertext()) if c.find('s:is',N) is not None else ''
      if c.attrib.get('t')=='s':val=ss[int(val)]
      if val: vals[c.attrib['r']]=val
     rows.append(vals)
    e.clear()
  yield {'sheet':sh.attrib['name'],'rows':count,'sample':rows}
if __name__=='__main__':
 print(json.dumps([{'file':str(p),'sheets':list(sheets(p))} for p in pathlib.Path('data').rglob('*.xlsx')],indent=2))
