#!/usr/bin/env python3
"""Treinamento de pesquisa StitchingNet (uso não comercial, CC BY-NC 4.0).
Layout esperado: DATASET/<tecido>/<classe>/*.jpg. Classes são inferidas do diretório pai.
Não envia pesos à produção automaticamente.
"""
import argparse, csv, json, random
from pathlib import Path
from collections import Counter
import numpy as np
import tensorflow as tf

def gather(root):
    files=sorted(p for p in Path(root).glob("*/*/*.jpg") if p.is_file())
    if not files: raise ValueError("Nenhuma imagem em DATASET/<tecido>/<classe>/*.jpg")
    labels=sorted({p.parent.name for p in files})
    if len(labels)<2: raise ValueError("São necessárias pelo menos duas classes.")
    return files,labels

def split(files,seed):
    # Grupos por tecido e classe: preserva variação e evita usar imagens idênticas em treino/teste.
    groups={}
    for p in files: groups.setdefault((p.parent.parent.name,p.parent.name),[]).append(p)
    rng=random.Random(seed);parts={"train":[],"val":[],"test":[]}
    for group in groups.values():
        rng.shuffle(group)
        n=len(group);a=int(n*.7);b=int(n*.85)
        if n<7: raise ValueError("Grupo com menos de 7 imagens: split não confiável")
        parts["train"]+=group[:a];parts["val"]+=group[a:b];parts["test"]+=group[b:]
    return parts

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--data",required=True)
    parser.add_argument("--output",default="artifacts/stitchingnet")
    parser.add_argument("--epochs",type=int,default=20)
    parser.add_argument("--seed",type=int,default=42)
    args=parser.parse_args()
    tf.keras.utils.set_random_seed(args.seed)
    files,labels=gather(args.data);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    parts=split(files,args.seed);lookup={x:i for i,x in enumerate(labels)}
    for part,paths in parts.items():
        with (out/(part+".csv")).open("w",newline="") as f:
            w=csv.writer(f);w.writerow(["path","class"]);w.writerows([(str(x),x.parent.name) for x in paths])
    def dataset(paths,shuffle=False):
        xs=[str(p) for p in paths];ys=[lookup[p.parent.name] for p in paths]
        ds=tf.data.Dataset.from_tensor_slices((xs,ys))
        if shuffle: ds=ds.shuffle(len(paths),seed=args.seed)
        def decode(path,label):
            img=tf.image.decode_jpeg(tf.io.read_file(path),channels=3)
            img=tf.image.resize(img,[224,224]);return tf.keras.applications.mobilenet_v3.preprocess_input(img),label
        return ds.map(decode,num_parallel_calls=tf.data.AUTOTUNE).batch(32).prefetch(tf.data.AUTOTUNE)
    train,val,test=(dataset(parts[p],p=="train") for p in ("train","val","test"))
    base=tf.keras.applications.MobileNetV3Small(include_top=False,weights="imagenet",input_shape=(224,224,3),pooling="avg")
    base.trainable=False
    model=tf.keras.Sequential([base,tf.keras.layers.Dropout(.2),tf.keras.layers.Dense(len(labels),activation="softmax")])
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3),loss="sparse_categorical_crossentropy",metrics=["accuracy"])
    model.fit(train,validation_data=val,epochs=args.epochs,callbacks=[tf.keras.callbacks.EarlyStopping(monitor="val_loss",patience=4,restore_best_weights=True)])
    results=model.evaluate(test,verbose=0,return_dict=True)
    probs=model.predict(test,verbose=0);pred=probs.argmax(axis=1)
    truth=np.array([lookup[p.parent.name] for p in parts["test"]])
    confusion=np.zeros((len(labels),len(labels)),dtype=int)
    for actual,guess in zip(truth,pred):confusion[actual,guess]+=1
    metrics={"dataset":"StitchingNet","license":"CC BY-NC 4.0 — uso não comercial","classes":labels,"counts":{k:len(v) for k,v in parts.items()},"test":{k:float(v) for k,v in results.items()},"confusion_matrix":confusion.tolist(),"seed":args.seed}
    (out/"metrics.json").write_text(json.dumps(metrics,indent=2,ensure_ascii=False))
    model.save(out/"model.keras")
    print(json.dumps(metrics,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
