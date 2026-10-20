# Configurar VisionQC no PC com Codex

## Clonar
```bash
git clone https://github.com/readytodeploy/visionqc-mobile.git
cd visionqc-mobile
```

Abra esta pasta no Codex (ou VS Code com extensão Codex); `AGENTS.md` contém as instruções de trabalho.

## Dataset StitchingNet (pesquisa)
Licença **CC BY-NC 4.0 — uso não comercial**. Não publicar imagens ou pesos derivados no repositório nem no Vercel.

```bash
python scripts/download_stitchingnet.py --extract
```

Baixa o arquivo original de aproximadamente 623 MB de Hugging Face e extrai em `datasets/StitchingNet/extracted/`.

Se a fonte bloquear downloads automatizados, baixe manualmente:
- https://huggingface.co/datasets/hyungjungkim/StitchingNet/tree/main
- https://www.kaggle.com/datasets/hyungjung/stitchingnet-dataset
- https://data.mendeley.com/datasets/6tdthsjgfc/1

Coloque `StitchingNet.zip` em `datasets/StitchingNet/` e execute `python scripts/download_stitchingnet.py --extract`.

## Ambiente de treino
```bash
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r training/requirements.txt
```

Antes de treinar, confirme a organização das pastas. O script de treino espera `<data>/<tecido>/<classe>/*.jpg` conforme notebook original. **Não execute treinamento sem conferir estrutura, classes e licença.**

## Interface
Um servidor HTTP local permite carregar scripts e arquivos da aplicação:
```bash
python -m http.server 8000
```
Acesse http://localhost:8000. Roboflow remoto exige o backend Vercel/credenciais; não funcionará com um servidor HTTP estático sozinho. Para testar o backend, configure uma execução local de Vercel com variáveis de ambiente próprias, sem publicá-las.

## Tarefa para Codex
Leia `AGENTS.md` e `docs/MODEL_ARCHITECTURE.md`. Analise a arquitetura, valide o dataset completo e melhore o pipeline de treinamento, sem afirmar que o modelo está pronto para produção antes da avaliação.
