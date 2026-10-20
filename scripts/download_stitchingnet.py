#!/usr/bin/env python3
"""Download original StitchingNet for LOCAL research; never add it to Git.
Usage: python scripts/download_stitchingnet.py
"""
from pathlib import Path
import argparse, hashlib, os, sys, zipfile
from urllib.request import Request, urlopen

URL="https://huggingface.co/datasets/hyungjungkim/StitchingNet/resolve/main/StitchingNet.zip?download=true"
def download(url, dest):
    req=Request(url,headers={"User-Agent":"VisionQC-dataset-research/1.0"})
    with urlopen(req,timeout=120) as resp, dest.open("wb") as out:
        total=int(resp.headers.get("Content-Length") or 0);read=0
        while True:
            buf=resp.read(2*1024*1024)
            if not buf:break
            out.write(buf);read+=len(buf)
            print(f"Baixando: {read/1024**2:.1f} MB"+(f" / {total/1024**2:.1f} MB" if total else ""),end="\r",flush=True)
    print()
def safe_unzip(archive,folder):
    root=folder.resolve()
    with zipfile.ZipFile(archive) as z:
        for m in z.infolist():
            target=(folder/m.filename).resolve()
            if not target.is_relative_to(root):raise ValueError("ZIP contém caminho inválido")
        z.extractall(folder)
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",default="datasets/StitchingNet")
    ap.add_argument("--extract",action="store_true")
    args=ap.parse_args(); dest=Path(args.out);dest.mkdir(parents=True,exist_ok=True)
    archive=dest/"StitchingNet.zip"
    print("StitchingNet: pesquisa não comercial (CC BY-NC 4.0).")
    if not archive.exists():
        try:download(URL,archive)
        except Exception:
            archive.unlink(missing_ok=True)
            print("Download direto falhou. Use Kaggle ou Mendeley e coloque StitchingNet.zip em",dest,file=sys.stderr)
            raise
    if not zipfile.is_zipfile(archive):raise ValueError("Arquivo inválido; apague e baixe novamente")
    print("Arquivo ZIP íntegro:",archive,"(",round(archive.stat().st_size/1024**2,1),"MB )")
    if args.extract:
        folder=dest/"extracted";folder.mkdir(exist_ok=True);safe_unzip(archive,folder)
        print("Extraído em:",folder)
    else:print("Use --extract para descompactar.")
if __name__=="__main__":main()
