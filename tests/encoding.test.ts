import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function files(root:string):string[] {
  return readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(root,entry.name)):[join(root,entry.name)]);
}

describe('portable source encoding',()=>{
  it('keeps source and original art strictly UTF-8 on Windows and Linux',()=>{
    const decoder=new TextDecoder('utf-8',{fatal:true});
    const paths=[...files('src'),...files('public/art')].filter(path=>/\.(ts|css|svg)$/.test(path));
    expect(paths.length).toBeGreaterThan(30);
    for(const path of paths){
      let text='';
      expect(()=>{text=decoder.decode(readFileSync(path));},`${path} must be UTF-8, not PowerShell ANSI`).not.toThrow();
      expect(text,`${path} must not contain replacement characters`).not.toContain('\uFFFD');
    }
  });
});
