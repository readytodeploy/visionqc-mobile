# VisionQC — Codex development instructions

## Objective
Develop VisionQC Mobile for phone and desktop with independent product inspection models: MDF, textiles, mattresses and upholstery.

## Existing system
- Static frontend: `index.html`, `assets/styles.css`, `js/app.js`.
- Vercel serverless: `api/roboflow.js` (keep ROBOFLOW_API_KEY server-side).
- Profiles: `config/model-profiles.json`.
- StitchingNet classification research: `training/train_stitchingnet.py`.
- Production supports MDF Roboflow V3, not yet verified by formal field validation. Textile/mattress/sofa models must remain marked as not trained.

## Safety and quality
- Never commit real datasets, training artifacts, access tokens, or API keys.
- StitchingNet original data license: CC BY-NC 4.0. Research only, not commercial deployment without permission.
- Distinguish image-level classification from precise defect localization. Never show invented bounding boxes.
- Never falsely mark untrained profiles as ready. Review any new dataset license before use.
- Keep pt-BR interface, accessible touch targets, responsive phone/tablet/PC layout.
- Do not cover inspection frame with result panels. Permit next manual inspection without refresh.
- Add tests for frontend initialization, profile switching and API safety before claiming fixes.
- Use held-out test data and publish accuracy, recall/F1 by defect class; group related images by production sequence or lot where possible.

## Starting tasks
1. Run the app locally and reproduce mobile/desktop flows; identify JavaScript errors and CSS regressions.
2. Download StitchingNet to `datasets/` with `python scripts/download_stitchingnet.py --extract`.
3. Inspect its real directory layout; adapt trainer safely; assess data leakage.
4. Execute training only in research environment; evaluate on held-out product groups.
5. Investigate StitchingNet-Seg for segmentation masks and precise defect localization.
6. Define model export and browser/server inference integration once legally usable weights are trained.
7. Commit small tested changes and deploy on Vercel only after verification.
