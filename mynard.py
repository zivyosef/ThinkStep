# %%
import os

SHEET_NAME = "all_protein"
PATH_DATA = "/cs/usr/ziv442/projects/raw data/Lung cancer/Data_Maynard2020_Lung/Data_Maynard2020_Lung"
RESULTS_PATH = "/cs/usr/ziv442/projects/results/LR/Data_Maynard2020_Lung/all_protein"
# ensure results path exists
os.makedirs(RESULTS_PATH, exist_ok=True)

# %%
import os
from typing import Optional
import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.io import mmread
import scanpy as sc


def _ensure_cells_by_genes(X: sp.spmatrix, n_genes: int, n_cells: int) -> sp.spmatrix:
    """
    Ensure X is (cells, genes). Transpose if it's (genes, cells); raise on mismatch.
    """
    if X.shape == (n_cells, n_genes):
        return X.tocsr()
    if X.shape == (n_genes, n_cells):
        return X.T.tocsr()
    raise ValueError(f"MTX shape {X.shape} doesn't match (#cells={n_cells}, #genes={n_genes}).")


def _pick_merge_key(obs: pd.DataFrame, samples: pd.DataFrame) -> Optional[str]:
    """
    Pick a reasonable key to merge Samples.csv into obs, if it exists in both.
    """
    candidates = ["sample", "Sample", "SampleID", "sample_id", "PatientID", "patient_id"]
    obs_cols = set(obs.columns)
    samp_cols = set(samples.columns)
    for key in candidates:
        if key in obs_cols and key in samp_cols:
            return key
    return None


def _make_cell_ids(cells_df: pd.DataFrame, cell_id_col: Optional[str]) -> pd.Index:
    """
    Choose obs_names (unique cell IDs).
    - If cell_id_col is provided and unique → use it.
    - If provided but NOT unique (e.g., 'sample') → make composite IDs: '{value}__{row_index}'.
    - If not provided → use the first column; if not unique, make composite as above.
    """
    if cell_id_col is None:
        base = cells_df.iloc[:, 0].astype(str)
    else:
        if cell_id_col not in cells_df.columns:
            raise KeyError(f"Column '{cell_id_col}' not found in Cells.csv")
        base = cells_df[cell_id_col].astype(str)

    if base.is_unique:
        return pd.Index(base.values, name="cell")

    # Not unique → build deterministic unique IDs
    # Try to incorporate an existing 'sample' column if available for clarity
    if "sample" in cells_df.columns:
        sample_col = cells_df["sample"].astype(str)
        unique_ids = sample_col + "__" + base + "__" + cells_df.reset_index().index.astype(str)
    else:
        unique_ids = base + "__" + cells_df.reset_index().index.astype(str)

    return pd.Index(unique_ids.values, name="cell")


def load_dataset(
    data_path: str,
    cell_id_col: Optional[str] = None,
    merge_samples: bool = True,
) -> sc.AnnData:
    """
    Load the Biermann 2022 skin dataset (UMI MTX + per-cell + per-sample metadata) into AnnData.

    Parameters
    ----------
    data_path : str
        Directory with: Exp_data_UMIcounts.mtx, Genes.txt, Cells.csv, Samples.csv (optional).
    cell_id_col : Optional[str]
        Column in Cells.csv to use for obs_names (can be 'sample'—unique IDs will be auto-created).
    merge_samples : bool
        If True, merges Samples.csv onto obs when a reasonable key exists.

    Returns
    -------
    adata : AnnData
        X raw UMI counts (cells × genes), var=genes, obs=cell metadata (+ optional sample metadata).
    """
    fp_mtx = os.path.join(data_path, "Exp_data_counts.mtx")
    fp_genes = os.path.join(data_path, "Genes.txt")
    fp_cells = os.path.join(data_path, "Cells.csv")
    fp_samples = os.path.join(data_path, "Samples.csv")

    if not os.path.exists(fp_mtx):
        raise FileNotFoundError(f"Missing file: {fp_mtx}")
    if not os.path.exists(fp_genes):
        raise FileNotFoundError(f"Missing file: {fp_genes}")
    if not os.path.exists(fp_cells):
        raise FileNotFoundError(f"Missing file: {fp_cells}")

    # Read sparse counts and metadata
    X = mmread(fp_mtx).tocsr()
    with open(fp_genes, "r") as f:
        genes = [line.strip() for line in f if line.strip()]  

    genes = np.array(genes, dtype=str)
    cells_df = pd.read_csv(fp_cells)

    # Determine gene/cell counts and ensure X orientation is cells × genes
    n_genes = len(genes)
    n_cells_in_cells_df = len(cells_df)
    X = _ensure_cells_by_genes(X, n_genes=n_genes, n_cells=n_cells_in_cells_df)

    # Build unique obs_names (works even if cell_id_col='sample')
    obs_names = _make_cell_ids(cells_df, cell_id_col=cell_id_col)

    # Construct AnnData
    adata = sc.AnnData(X=X)
    adata.var_names = genes
    adata.var_names_make_unique()
    adata.obs_names = obs_names

    # Attach per-cell metadata (align by position; both dataframes are in the same original order)
    cells_df.index = adata.obs_names
    adata.obs = cells_df

    # Optionally merge per-sample metadata
    if merge_samples and os.path.exists(fp_samples):
        samples_df = pd.read_csv(fp_samples)
        key = _pick_merge_key(adata.obs, samples_df)
        if key:
            adata.obs = adata.obs.merge(samples_df, on=key, how="left")
        else:
            print("! Skipped merging Samples.csv (no common key found).")

    # Sanity checks
    if adata.n_obs != X.shape[0] or adata.n_vars != X.shape[1]:
        raise RuntimeError("AnnData dimensions do not align after loading.")

    return adata



# %%
adata = load_dataset(
    data_path=PATH_DATA,
    cell_id_col="sample",   # OK: will auto-create unique cell IDs and keep 'sample' in obs
    merge_samples=True,
)

print(adata)
print("obs columns:", list(adata.obs.columns)[:10], "...")
print("var genes:", adata.n_vars, "| cells:", adata.n_obs)

# %%
import numpy as np
import pandas as pd
import scipy.sparse as sp

X = adata.X.tocsr() if sp.issparse(adata.X) else np.asarray(adata.X)

def sample_data(x, max_n=2_000_000):
    # Take a random subset of nonzeros to speed up stats on huge matrices
    if sp.issparse(x):
        data = x.data
    else:
        data = x.ravel()
        data = data[data != 0]
    if data.size > max_n:
        idx = np.random.choice(data.size, size=max_n, replace=False)
        data = data[idx]
    return data

nz = sample_data(X)

# 1) האם הערכים שלמים?
frac_part = nz - np.floor(nz)
share_integers = (frac_part == 0).mean()  # יחס הערכים שהם בדיוק שלמים

# 2) טווח הערכים (יעזור לזהות log1p)
vmin, vmax = float(nz.min()), float(nz.max())

# 3) סכומי ספריה לכל תא (library size); בנורמליזציה בסגנון scanpy לרוב קרוב ל~1e4
cell_sums = np.asarray(X.sum(axis=1)).ravel()
sum_mean, sum_sd, sum_cv = cell_sums.mean(), cell_sums.std(), cell_sums.std()/max(1e-9, cell_sums.mean())

# 4) ממוצע מול שונות (raw מציג לרוב mean–variance relationship חזקה)
gene_means = np.asarray(X.mean(axis=0)).ravel()
gene_vars  = (np.asarray(X.power(2).mean(axis=0)).ravel() - gene_means**2) if sp.issparse(X) \
             else X.var(axis=0)
corr_mv = np.corrcoef(gene_means, gene_vars)[0,1]

print(f"Share of exact integers (on nonzeros): {share_integers:.3f}")
print(f"Value range (nonzeros): [{vmin:.3f}, {vmax:.3f}]")
print(f"Per-cell library size: mean={sum_mean:.1f}, sd={sum_sd:.1f}, CV={sum_cv:.3f}")
print(f"Mean–variance correlation across genes: r≈{corr_mv:.3f}")

# אינדיקציות מהירות:
if share_integers > 0.99 and vmax >= 20 and sum_cv > 0.3:
    print("→ Likely RAW UMI counts.")
elif vmax <= 12 and share_integers < 0.9 and 5_000 <= sum_mean <= 20_000 and sum_cv < 0.1:
    print("→ Likely log1p(normalized) values (Scanpy-like normalize_total→log1p).")
else:
    print("→ Mixed/unknown scale. Inspect adata.uns/layers and preprocessing provenance.")


# %%
# lr_pipeline.py
from __future__ import annotations
from typing import Optional
import matplotlib.pyplot as plt
import scanpy as sc

# =========================
# 1) QC and filtering
# =========================
def qc_quick_hist(adata, bins=60):
    ad = adata.copy()
    sc.pp.calculate_qc_metrics(ad, inplace=True)
    has_mt = "pct_counts_mt" in ad.obs

    nplots = 3 if has_mt else 2
    fig, axes = plt.subplots(1, nplots, figsize=(5*nplots, 3))

    axes[0].hist(ad.obs["n_genes_by_counts"], bins=bins); axes[0].set_title("n_genes")
    axes[1].hist(ad.obs["total_counts"], bins=bins);      axes[1].set_title("total_counts")

    if has_mt:
        axes[2].hist(ad.obs["pct_counts_mt"], bins=bins); axes[2].set_title("pct_mt")

    plt.tight_layout(); plt.show()


# =========================
# 2) normaliz log + HVGs
# =========================
def normalize_and_hvg(
    adata: sc.AnnData,
    n_top_genes: int = 4000,
    batch_key: Optional[str] = None,
) -> sc.AnnData:
    """
    Normalize counts, log1p, pick HVGs (optionally per batch).

    - Saves .raw before HVG (optional).
    - Returns AnnData with X = log1p normalized, .var['highly_variable']=True.
    """
    # put level of raw counts as counts
    adata.layers["counts"] = adata.X.copy()
    sc.pp.normalize_total(adata, target_sum=1e4)
    sc.pp.log1p(adata)
    #sc.pp.highly_variable_genes(
    #   ad, flavor="seurat_v3", n_top_genes=n_top_genes, batch_key=batch_key
    #)
    # take only HVGs
    #ad = ad[:, ad.var["highly_variable"]].copy()

    return adata


# %%
import scanpy as sc

def preprocess_adata(
    adata,
    categories_to_drop=['LiveMACS', 'mixUnsortCD45MACS', 'CD45pCD3nCD19nMACS'],
    cell_type=None
):
    """
    Preprocess AnnData by normalizing/log-transforming and filtering by metadata if available.

    Steps:
    1) perform QC filtering
    2) normalize and log-transform the data and hvg selection
    3) filter cells by categories_to_drop in 'cell_subtype' if available
    4) if cell_type is provided, filter to only that cell type
    5) return the processed AnnData
    """
    # 1) QC histogram
    qc_quick_hist(adata)
    
    # 2) normalization and hvg selection
    adata = normalize_and_hvg(adata)
    # 4) if cell_type is provided, filter to only that cell type
    if cell_type is not None:
        if 'cell_type' in adata.obs:
            mask = adata.obs['cell_type'] == cell_type
            adata = adata[mask].copy()
        else:
            raise KeyError("'cell_type' column not found in adata.obs") 
    return adata


# %%
adata = preprocess_adata(adata, cell_type=None)

# %%
import pandas as pd
import numpy as np

# להסיר גרשיים בתחילת/סוף (ולנקות רווחים)
adata.var_names = (
    pd.Index(adata.var_names.astype(str))
      .str.strip()
      .str.replace(r'^"+|"+$', '', regex=True)   # "A1BG" -> A1BG
      .str.replace(r"^'+|'+$", '', regex=True)   # אם יש גם 'A1BG'
)

adata.var_names_make_unique()



# %% [markdown]
# # Preteset: calculate new CNMF

# %%
import re
from typing import Dict, Optional

def shorten_name(s: str, canonical_by_prefix: Optional[Dict[str, str]] = None) -> str:
    """
    Shorten program name, and אם יש מיפוי קנוני לפי prefix (למשל 'pTNI09'),
    מאחד את כל השמות אליו (לפי test2).
    """
    # --- שלב 1: קיצור השם כמו קודם ---
    m = re.search(r'\(([^)]+)\)', s)
    if m:
        inner = m.group(1).strip()
        if ',' in inner:
            # comma-separated -> keep items as tokens joined by underscore
            inner_clean = re.sub(r'[^0-9A-Za-z,]+', '_', inner)
            inner_clean = inner_clean.replace(',', '_').strip('_')
        else:
            # no comma: treat '-' as '_' but remove spaces
            # e.g. "gd-like T" -> "gd_likeT", "innate T" -> "innateT"
            inner_mod = inner.replace('-', '_')
            inner_clean = re.sub(r'[^0-9A-Za-z_]+', '', inner_mod)

        s = re.sub(r'\s*\([^)]+\)', '_' + inner_clean, s, count=1)

    # ניקוי כללי
    s = re.sub(r'[^0-9A-Za-z_]+', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')

    # --- שלב 2: איחוד לשם קנוני לפי prefix (לפי test2) ---
    if canonical_by_prefix:
        # מוצאים את ה-prefix: pTNI + מספרים
        m_prefix = re.match(r'(pTNI\d+)', s)
        if m_prefix:
            prefix = m_prefix.group(1)
            if prefix in canonical_by_prefix:
                return canonical_by_prefix[prefix]

    return s


# מיפוי קנוני לדוגמה (לפי test2):
CANONICAL = {
    "pTNI11": "pTNI11",
    "pTNI09": "pTNI09_Elongationfactors",
    # אפשר להוסיף גם:
    # "pTNI14": "pTNI14_gd_likeT",
}

# בדיקות:
print(shorten_name("pTNI01 (Fos, Jun)", CANONICAL))          # pTNI01_Fos_Jun
print(shorten_name("pTNI14 (gd-like T)", CANONICAL))         # pTNI14_gd_likeT
print(shorten_name("pTNI08 (innate T)", CANONICAL))          # pTNI08_innateT

# דוגמאות עם האיחוד:
print(shorten_name("pTNI11 (mitochondrial)", CANONICAL))     # pTNI11
print(shorten_name("pTNI11", CANONICAL))                     # pTNI11
print(shorten_name("pTNI09 (prolif)", CANONICAL))            # pTNI09_Elongationfactors
print(shorten_name("pTNI09 (Elongation factors)", CANONICAL))# pTNI09_Elongationfactors


# %%
import numpy as np
from cnmf import load_df_from_npz
def choose_best_k_combined(stats, w_stab=0.5, w_err=0.5):
    # k כערכים שלמים
    Ks = stats["k"].values.astype(int)

    # אצלך "stability" נקרא silhouette
    stab = stats["silhouette"].values
    err  = stats["prediction_error"].values

    # נרמול ל-[0,1]
    stab_norm = (stab - stab.min()) / (stab.max() - stab.min())
    # עבור error – קטן יותר זה טוב, לכן מהפכים
    err_norm  = (err.max() - err) / (err.max() - err.min())

    # ציון משוקלל: אפשר לשחק עם המשקולות
    score = w_stab * stab_norm + w_err * err_norm

    best_idx = np.argmax(score)
    best_k   = Ks[best_idx]
    return best_k, score


def get_k_stats(cnmf_obj):
    # מפעיל את החישוב ושומר stats
    cnmf_obj.k_selection_plot(close_fig=True)
    # טוען את הסטטיסטיקות
    stats = load_df_from_npz(cnmf_obj.paths["k_selection_stats"])
    # stats.columns: ['k', 'local_density_threshold', 'stability', 'prediction_error']
    # print stats summary
    print("K selection stats:")
    print(stats)
    return stats


# %%
import scanpy as sc
import pandas as pd
import numpy as np
import os
from cnmf import cNMF

CNMF_INPUTS_DIR = "/sci/labs/matanh/ziv442/projects/results/LR/Lee_Lung/"
OUTPUT_DIR_CNM = "/cs/usr/ziv442/projects/results/LR/cnmf_results_Lee_Lung/"

def run_cnmf(counts_path, cell_type, Ks=[8,10,12], n_iter=50, seed=14, density=0.01):
    out_dir = os.path.join(OUTPUT_DIR_CNM, cell_type)
    os.makedirs(out_dir, exist_ok=True)

    cnmf_obj = cNMF(output_dir=out_dir, name=f"{cell_type}_cnmf")

    cnmf_obj.prepare(
        counts_fn=counts_path,
        n_iter=n_iter,
        components=Ks,
        seed=seed,
    )
    cnmf_obj.factorize()
    cnmf_obj.combine()

    # Robust K-selection: if some Ks fail (e.g., NaN stats), keep only valid rows.
    best_k = None
    if len(Ks) > 1:
        try:
            stats = get_k_stats(cnmf_obj)
            if not stats.empty:
                best_k, score = choose_best_k_combined(stats)
                print("Selected best_k =", best_k, "with score =", score)
            else:
                print("No finite K-selection rows found; fallback to first provided K.")
        except Exception as e:
            print(f"k-selection failed ({e}); fallback to first provided K.")

    if best_k is None:
        best_k = int(Ks[0])

    cnmf_obj.consensus(k=best_k, density_threshold=density)
    H, W, W_tpm, top_genes = cnmf_obj.load_results(K=best_k, density_threshold=density)
    return H, W, W_tpm, top_genes

# %%
import scanpy as sc
import numpy as np
import scipy.sparse as sp
import os

def prep_for_cnmf(adata, cell_type, ct_key="cell_subtype", n_hvg=3000, out_dir=CNMF_INPUTS_DIR):
    os.makedirs(out_dir, exist_ok=True)
    sub = adata[adata.obs[ct_key] == cell_type].copy()
    print(f"Prepared {adata.n_obs} cells and {adata.n_vars} genes for cNMF.")

    # Ensure raw counts in X
    if "counts" in sub.layers:
        sub.X = sub.layers["counts"]
    elif sub.raw is not None:
        sub.X = sub.raw[:, sub.var_names].X
    else:
        raise ValueError("No raw counts found: provide sub.layers['counts'] or .raw")

    print(f"Using {sub.n_obs} cells and {sub.n_vars} genes for cNMF of {cell_type}.")
    sc.pp.highly_variable_genes(sub, flavor="seurat_v3", n_top_genes=n_hvg)
    sub = sub[:, sub.var["highly_variable"].astype(bool)].copy()
    print(f"Prepared {sub.n_obs} cells and {sub.n_vars} HVGs for cNMF of {cell_type}.")

    # Sanitize NaN/Inf before writing, because cNMF k-selection uses sklearn KMeans (no NaNs allowed).
    if sp.issparse(sub.X):
        data = sub.X.data
        bad_mask = ~np.isfinite(data)
        bad_n = int(bad_mask.sum())
        if bad_n > 0:
            print(f"Found {bad_n} non-finite sparse values in {cell_type}; replacing with 0.")
            data[bad_mask] = 0.0
            sub.X.data = data
            sub.X.eliminate_zeros()
    else:
        X_arr = np.asarray(sub.X)
        bad_mask = ~np.isfinite(X_arr)
        bad_n = int(bad_mask.sum())
        if bad_n > 0:
            print(f"Found {bad_n} non-finite dense values in {cell_type}; replacing with 0.")
            X_arr = np.nan_to_num(X_arr, nan=0.0, posinf=0.0, neginf=0.0)
            sub.X = X_arr

    # Drop optional columns safely (ignore if missing)
    sub.obs.drop(columns=["mp_top", "mp_assignment", "time_end_of_rx_to_sampling"], errors="ignore", inplace=True)
    fn = os.path.join(out_dir, f"{cell_type}.h5ad")
    sub.write_h5ad(fn)
    return fn

# %%
cnmf_results_test1 = {}
cell_type = "T_cell"
print(f"Running cNMF for {cell_type}...")
if adata.obs[adata.obs['cell_type'] == cell_type].shape[0] < 300:
    print(f"Skipping {cell_type} due to insufficient cell count.")
# think what to do for small size cell type
counts_fn = prep_for_cnmf(adata, cell_type=cell_type, ct_key="cell_type", n_hvg=5000)
H, W, W_tpm, top_genes = run_cnmf(counts_fn, cell_type=cell_type, Ks=[8,20,21], n_iter=50, seed=14)
cnmf_results_test1[cell_type] = {"W": W, "H": H, "W_tpm": W_tpm, "top_genes": top_genes}
print("cNMF run completed for T cells.")

# %%
def get_ligand_expression_df(adata, ligand_csv_path='/cs/usr/ziv442/projects/results/LR/cellphonedb_protein_sets.xlsx', sheet_name="all_protein"):
    """
    Load ligand gene names from CSV, extract their expression from adata,
    and return a DataFrame with ligand expression and cell metadata.

    Parameters
    ----------
    adata : AnnData
        Annotated data matrix (cells × genes).
    ligand_csv_path : str
        Path to Excel file containing ligand gene names (column: 'symbol').

    Returns
    -------
    df : pd.DataFrame
        DataFrame with index = cell barcodes, columns = ligand genes + patient_x + cell_type.
    ligand_genes_in_adata : list
        List of ligand gene names present in adata.var_names.
    """
    # Load ligands
    ligands = pd.read_excel(ligand_csv_path, sheet_name=sheet_name)
    ligands_gene_names = ligands['symbol'].dropna().unique().tolist()
    print("Ligands gene names:", ligands_gene_names)

    # Filter ligands present in adata
    ligand_genes_in_adata = [g for g in ligands_gene_names if g in adata.var_names]
    X_ligands = adata[:, ligand_genes_in_adata].X  # cells × ligand genes
    print("Ligands in data shape is", X_ligands.shape)

    # Build DataFrame
    df = pd.DataFrame(X_ligands.toarray(), index=adata.obs.index, columns=ligand_genes_in_adata)
    df = df.join(adata.obs[['patient_x', 'cell_type']])
    return df, ligand_genes_in_adata

# %%
df, ligand_genes_in_adata = get_ligand_expression_df(adata)
print("Ligand genes in adata:", ligand_genes_in_adata)

# %%
import numpy as np
import xgboost as xgb

def run_xgb_regression(
    mean_expr_celltype,
    mean_scores,
    cell_types,
    random_state=42,
    n_folds=5,
    num_boost_round=4000,
    early_stopping_rounds=200,
):
    """
    CV-only version (single xgb.cv run per program).
    - Uses xgb.cv to pick best_num_boost_round (via early stopping).
    - Trains ONE final model on ALL data (no external test split).
    - Metrics are taken from CV ("test-*-mean").
    Note: y_pred here are fitted predictions on the full data (not OOF).
    """
    results_xgb = {}

    params = {
        "objective": "reg:squaredlogerror",
        "eval_metric": ["rmsle", "rmse", "mae"],
        "eta": 0.05,
        "max_depth": 3,
        "subsample": 0.8,
        "colsample_bytree": 0.7,
        "reg_lambda": 1.0,
        "seed": random_state,
    }

    for ct in cell_types:
        X_df = mean_expr_celltype[ct]
        Y_df = mean_scores[ct]

        # align patients (safe)
        X_df, Y_df = X_df.align(Y_df, join="inner", axis=0)

        ligand_names  = X_df.columns.tolist()
        program_names = Y_df.columns.tolist()

        X_all = X_df.values
        Y_all = Y_df.values

        print(f"Cell type: {ct}, X shape: {X_all.shape}, Y shape: {Y_all.shape}")
        results_xgb[ct] = {}

        for j, prog in enumerate(program_names):
            y_all = Y_all[:, j]

            # drop NaNs per program
            m = ~np.isnan(X_all).any(axis=1) & ~np.isnan(y_all)
            X = X_all[m]
            y = y_all[m]

            dtrain = xgb.DMatrix(X, label=y, feature_names=ligand_names)

            # (1) CV on all data (single split scheme)
            cv_df = xgb.cv(
                params=params,
                dtrain=dtrain,
                nfold=n_folds,
                num_boost_round=num_boost_round,
                early_stopping_rounds=early_stopping_rounds,
                seed=random_state,
                shuffle=True,
                verbose_eval=False,
            )

            best_round = len(cv_df)

            # (2) Train final model on ALL data with best_round
            booster = xgb.train(
                params=params,
                dtrain=dtrain,
                num_boost_round=best_round,
                verbose_eval=False,
            )

            # CV metrics (mean across folds) at best_round
            rmsle = float(cv_df["test-rmsle-mean"].iloc[-1])
            rmse  = float(cv_df["test-rmse-mean"].iloc[-1])
            mae   = float(cv_df["test-mae-mean"].iloc[-1])

            # fitted preds on full data (not OOF)
            y_pred = booster.predict(dtrain)

            results_xgb[ct][prog] = {
                "rmsle": rmsle,
                "rmse": rmse,
                "mae": mae,
                "y_test": y,          # here: all filtered y (not a held-out test)
                "y_pred": y_pred,     # fitted preds (not CV preds)
                "best_iteration": best_round - 1,
                "importance": booster.get_score(importance_type="gain"),
                "model": booster
            }

    return results_xgb


# %%
print("n_obs:", adata.n_obs)
print("unique patients:", adata.obs["patient_x"].nunique(dropna=False))

# %%
adata.obs['cell_type']

# %%
adata.obs['patient_x'].unique()

# %%
print(H.head())

# %%
# --- 0) Build per-cell ligand expression table once (outside the tests loop) ---

# df: rows = cells, columns = ligands + ['patient', 'cell_type']
df, ligand_genes_in_adata = get_ligand_expression_df(
adata
)

tumor_ct = "Malignant"
print(f"\n=== Running regression ===")

# 1) grab the corresponding cNMF results dict from globals()
cnmf_result = globals()[f"cnmf_results_test1"]  # adjust if needed for multiple tests
ct_key = "T_cell"  # unified name that we will use as the dict key
print(f"  Using '{ct_key}' from cnmf_results")

W = cnmf_results_test1[ct_key]["W_tpm"]   # genes × programs
H_raw = cnmf_results_test1[ct_key]["H"]  # cells × programs

adata_ct = adata[adata.obs["cell_type"] == ct_key].copy()

print(f"  {ct_key}: W shape = {W.shape}, H_raw type = {type(H_raw)}, H_raw shape = {getattr(H_raw, 'shape', None)}")

# ---- Build H with guaranteed correct columns + index ----
if isinstance(H_raw, pd.DataFrame):
    # take first K program columns by POSITION (robust to column-name mismatch)
    H = H_raw.iloc[:, :W.shape[1]].copy()
    H.columns = W.columns
else:
    # assume numpy/array-like, shape (n_cells, K)
    H = pd.DataFrame(H_raw, columns=W.columns)

# set correct cell index (must match T-cell subset length)
assert H.shape[0] == adata_ct.n_obs, f"H rows {H.shape[0]} != T-cell cells {adata_ct.n_obs}"
H.index = adata_ct.obs_names

# attach patient
H["patient_x"] = adata_ct.obs["patient_x"].values

# optional sanity checks
print("H program NaN rate:", H[W.columns].isna().mean().mean())
print("H patient NaN rate:", H["patient_x"].isna().mean())

# Drop rows that failed to align (no patient found for that cell)
H = H.dropna(subset=["patient_x"])

# 5) Y: mean program scores per patient (T-cell programs)
mean_scores = {}
# group by patient and average program activations
mean_scores[ct_key] = H.groupby("patient_x")[W.columns].mean()
n_cells_per_patient = H.groupby("patient_x").size()
print(f"  n_cells_per_patient for {ct_key}:")
print(n_cells_per_patient)
# Columns here should be the program names (e.g. k1, k2, ... or pTNIxx)
print(f"  mean_scores[{ct_key}] shape: {mean_scores[ct_key].shape}")
# 6) X: mean ligand expression in tumor cells per patient
df_tumor = df[df["cell_type"] == tumor_ct].copy()

print(f"  df_tumor shape: {df_tumor.shape}")
mean_expr_celltype = {}
# group by patient and average ligand expression
mean_expr_celltype[ct_key] = (
    df_tumor
    .groupby("patient_x")[ligand_genes_in_adata]
    .mean()
)
print(f"  mean_expr_celltype[{ct_key}] shape: {mean_expr_celltype[ct_key].shape}")
# 7) Make sure X and Y share the same set of patients
common_patients = (
    mean_scores[ct_key].index
    .intersection(mean_expr_celltype[ct_key].index)
)
print(f"  common patients count: {len(common_patients)}")
mean_scores[ct_key] = mean_scores[ct_key].loc[common_patients]
mean_expr_celltype[ct_key] = mean_expr_celltype[ct_key].loc[common_patients]
print(f"  Using {len(common_patients)} patients for regression")

if len(common_patients) < 5:
    print("  ⚠ Warning: very few patients, results may be unstable.")

X = mean_expr_celltype[ct_key].copy()
Y = mean_scores[ct_key].copy()

print("X shape:", X.shape)
print("Y shape:", Y.shape)
print("patients:", list(Y.index))

print("X checksum:", float(X.to_numpy().sum()))
print("Y checksum:", float(Y.to_numpy().sum()))
print("\n--- DEBUG ALIGNMENT ---")
print("H shape:", H.shape)
print("H index example:", H.index[:3].tolist())
print("adata n_obs:", adata.n_obs, "adata obs_names example:", adata.obs_names[:3].tolist())

overlap = H.index.intersection(adata.obs_names)
print("H∩adata:", len(overlap), "/", H.shape[0], "frac:", len(overlap)/max(1, H.shape[0]))

mapped = adata.obs["patient_x"].reindex(H.index)
print("patient NaN rate:", mapped.isna().mean())
print("patients in H mapped:", mapped.dropna().astype(str).nunique())

print("df tumor rows:", (df["cell_type"] == tumor_ct).sum(), " / df rows:", df.shape[0])
print("df cell_type top:", df["cell_type"].value_counts().head(10).to_dict())

print("X patients:", X.index.nunique(), "Y patients:", Y.index.nunique())
print("common patients:", len(common_patients))
print("X patient dtype:", X.index.dtype, "Y patient dtype:", Y.index.dtype)

onlyY = set(Y.index) - set(X.index)
onlyX = set(X.index) - set(Y.index)
print("only in Y (sample):", list(sorted(map(str, onlyY)))[:10])
print("only in X (sample):", list(sorted(map(str, onlyX)))[:10])

print("X checksum:", float(X.to_numpy().sum()))
print("Y checksum:", float(Y.to_numpy().sum()))
print("--- END DEBUG ---\n")
genes = W.index
# אם X מגיע מ-adata:
assert (adata[:, genes].var_names == genes).all()  # זה חייב להיות True

# 8) Run XGBoost regression for this test and this cell type (T_cell)
cell_types_list = [ct_key]
results_xgb = run_xgb_regression(
    mean_expr_celltype,
    mean_scores,
    cell_types_list
)

print(f"✓ Completed XGBoost")
print(f"Results keys: {list(results_xgb.keys())}")

# %%
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

ct = "T_cell"  # unused but kept for clarity

# results_xgb is { "T_cell": { prog: { "rmsle": ... } } }
res_ct = results_xgb.get(ct, {})

prog_rmsle = {str(prog): res["rmsle"] for prog, res in res_ct.items() if "rmsle" in res}
rmsle_ser = pd.Series(prog_rmsle, name="rmsle").sort_values()

fig, ax = plt.subplots(figsize=(10, 5))
x = np.arange(len(rmsle_ser.index))
ax.bar(x, rmsle_ser.values, width=0.5, label="NNLS")

ax.set_xlabel("Program")
ax.set_ylabel("RMSLE")
ax.set_title("RMSLE per T-cell program (NNLS)")
ax.set_xticks(x)
ax.set_xticklabels(rmsle_ser.index, rotation=90)
ax.legend()
plt.tight_layout()
plt.show()


# %%
import pandas as pd

def collect_importances(results_xgb, normalize=True, z_score=False, importance_key=None):
    """
    Collect feature importances from results_xgb into a dictionary of DataFrames.
    
    Parameters
    ----------
    results_xgb : dict
        Nested dictionary from your XGBoost runs.
        Structure: results_xgb[cell_type][program][<importance_key>] = dict(ligand -> importance_value)
    
    normalize : bool, default=True
        If True, normalize importances per program so that each column sums to 1.
    
    z_score : bool, default=False
        If True, apply z-score normalization per column (after optional normalization).
    
    importance_key : str or None, default=None
        - If given, use this key directly (e.g. "importance_tumor" or "importance").
        - If None, the function will try, in order:
            1) "importance_tumor"
            2) "importance"
            3) The first key in `res` that starts with "importance".
    
    Returns
    -------
    dict of pd.DataFrame
        { cell_type : DataFrame (rows=ligands, cols=programs, values=importance) }
    """
    importance_tables = {}

    for ct, prog_dict in results_xgb.items():
        df_imp = pd.DataFrame()

        for prog, res in prog_dict.items():
            # --- decide which importance key to use ---
            key = importance_key
            if key is None:
                if "importance_tumor" in res:
                    key = "importance_tumor"
                elif "importance" in res:
                    key = "importance"
                else:
                    # fallback: take any key that starts with "importance"
                    cand = [k for k in res.keys() if k.startswith("importance")]
                    if cand:
                        key = cand[0]
                    else:
                        # no importance info for this program
                        continue
            
            imp = res.get(key, {})
            if not imp:
                # empty dict, skip this program
                continue

            s = pd.Series(imp, name=str(prog))  # ligands → importance, name = program
            df_imp = pd.concat([df_imp, s], axis=1)

        # if no programs had importances, continue
        if df_imp.empty:
            importance_tables[ct] = df_imp
            continue

        # fill missing ligands with 0
        df_imp = df_imp.fillna(0)

        if normalize:
            col_norms = np.sqrt((df_imp ** 2).sum(axis=0))
            col_norms[col_norms == 0] = 1
            df_imp = df_imp.div(col_norms, axis=1)

        # optional z-score per column
        if z_score:
            def _z(x):
                std = x.std()
                return (x - x.mean()) / (std if std != 0 else 1)
            df_imp = df_imp.apply(_z, axis=0)

        # remove columns that are all zeros
        df_imp = df_imp.loc[:, (df_imp != 0).any(axis=0)]

        importance_tables[ct] = df_imp

    return importance_tables


# %%
import os
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

PLOTS_PATH = "/cs/usr/ziv442/projects/results/LR/Lung Cancer/plots/" 

def plot_importance_heatmap_topN_with_rmsle(df, df_rmsle, cell_type, top_n=10,
                                            cluster_programs=True,  # cluster columns only
                                            gene_order="graded",     # "graded" or "cluster" or "none"
                                            value_transform="log1p", # "log1p" or None
                                            figsize=(10, 10), cmap="viridis",
                                            save_dir=PLOTS_PATH):
    """
    Heatmap of ligand-program importances (top N ligands per program)
    + compact RMSLE panel below.

    gene_order="graded" sorts genes to create a diagonal/graded look (less scattered).
    """

    if df is None or df.empty:
        print(f"No importance data for {cell_type}")
        return
    if df_rmsle is None or df_rmsle.empty or "program" not in df_rmsle or "rmsle" not in df_rmsle:
        print(f"No RMSLE data for {cell_type}")
        return

    # --- select top ligands (union of top_n per program) ---
    top_ligands = set()
    for prog in df.columns:
        col = df[prog].fillna(0)
        top = col.sort_values(ascending=False).head(top_n).index
        top_ligands.update(top)
    if not top_ligands:
        print(f"No top ligands found for {cell_type}")
        return

    df_top = df.loc[df.index.intersection(top_ligands)].fillna(0)

    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, f"ligand_program_importance_RMSLE_{cell_type}.png")

    # --- decide program (column) order: cluster columns only (optional) ---
    if cluster_programs and df_top.shape[1] > 1:
        cg = sns.clustermap(df_top.T, method="average", metric="cosine", cmap=cmap)
        plt.close(cg.fig)
        programs_order = df_top.columns[cg.dendrogram_row.reordered_ind].tolist()  # rows of df_top.T are programs
    else:
        programs_order = df_top.columns.tolist()

    df_plot = df_top[programs_order]

    # --- decide gene (row) order ---
    if gene_order == "graded" and df_plot.shape[0] > 1 and df_plot.shape[1] > 1:
        # "center of mass" along programs -> gives diagonal/graded structure
        w = df_plot.values
        col_pos = np.arange(w.shape[1], dtype=float)
        com = (w * col_pos).sum(axis=1) / (w.sum(axis=1) + 1e-9)  # weighted avg column index
        max_val = w.max(axis=1)
        order = np.lexsort((-max_val, com))  # primary=com (ascending), secondary=max_val (descending)
        df_plot = df_plot.iloc[order]
    elif gene_order == "cluster" and df_plot.shape[0] > 1 and df_plot.shape[1] > 1:
        cg2 = sns.clustermap(df_plot, method="average", metric="cosine", cmap=cmap)
        plt.close(cg2.fig)
        df_plot = df_plot.iloc[cg2.dendrogram_row.reordered_ind, :]

    # --- value transform to make signal more graded (optional) ---
    df_hm = np.log1p(df_plot) if value_transform == "log1p" else df_plot

    # --- main figure ---
    fig, (ax1, ax2) = plt.subplots(
        2, 1, figsize=figsize,
        gridspec_kw={"height_ratios": [5, 0.6]},
        constrained_layout=True
    )

    # --- top: heatmap ---
    vals = df_hm.values.ravel()
    vmax = np.quantile(vals, 0.98)
    vmin = 0

    sns.heatmap(df_hm, cmap=cmap, xticklabels=True, yticklabels=True,
                ax=ax1, vmin=vmin, vmax=vmax)

    ax1.set_title(f"Top {top_n} ligands per program ({cell_type})", fontsize=12)
    ax1.tick_params(axis='x', rotation=45)
    ax1.tick_params(axis='y', labelsize=8)

    # --- bottom: RMSLE points ---
    df_rmsle2 = df_rmsle.set_index("program").reindex(programs_order)
    rmsle_vals = df_rmsle2["rmsle"].values

    ax2.scatter(range(len(rmsle_vals)), rmsle_vals, color='black', s=15, zorder=3)
    ax2.set_xticks(range(len(programs_order)))
    ax2.set_xticklabels(programs_order, rotation=45, ha='right', fontsize=8)
    ax2.set_ylabel("RMSLE", fontsize=8)
    ax2.set_title("RMSLE per program", fontsize=9, pad=4)
    sns.despine(ax=ax2)
    ax2.set_ylim(np.nanmin(rmsle_vals) - 0.02, np.nanmax(rmsle_vals) + 0.05)

    # --- save + show ---
    fig.savefig(save_path, dpi=300, bbox_inches="tight")
    plt.show()
    print(f"Saved heatmap + RMSLE points to {save_path}")

# %%
results_xgb['T_cell']

# %%
import shap
results_path = f"/cs/usr/ziv442/projects/results/LR/Lung/shaft_summary/{SHEET_NAME}/"
os.makedirs(results_path, exist_ok=True)

for ct, programs in results_xgb.items():
    feature_names = list(mean_expr_celltype[ct].columns)
    X_ct = mean_expr_celltype[ct].values
    
    for prog_name, metrics in programs.items():
        trained_model = metrics["model"]
        explainer = shap.TreeExplainer(trained_model)
        shap_values = explainer.shap_values(X_ct)

        # handle possible list output (multioutput)
        if isinstance(shap_values, list):
            shap_values = shap_values[0]

        # summary table: mean(|shap|) per feature
        mean_abs = np.mean(np.abs(shap_values), axis=0)
        df_sum = (pd.DataFrame({"feature": feature_names, "mean_abs_shap": mean_abs})
                    .sort_values("mean_abs_shap", ascending=False)
                    .reset_index(drop=True))

        df_sum.to_csv(f"{results_path}{ct}_{prog_name}_shap_mean_abs.csv", index=False)

# %%
# plot heatmap for test 1 results and test 2 results
print(f"\n--- Plotting importances ---")

importance_tables = collect_importances(results_xgb, normalize=True, z_score=False, importance_key="importance")
ct = "T_cell"
df_imp = importance_tables.get(ct, None)
if df_imp is None or df_imp.empty:
    print(f"No importance data for {ct} to plot")

# build rmsle_df for this test and cell type
res_ct = results_xgb.get(ct, {})
prog_rmsle = {str(prog): res["rmsle"] for prog, res in res_ct.items() if "rmsle" in res}
rmsle_ser = pd.Series(prog_rmsle, name="rmsle").sort_values()
# turn to DataFrame
rmsle_df = pd.DataFrame({
    "program": rmsle_ser.index,
    "rmsle": rmsle_ser.values
})
plot_importance_heatmap_topN_with_rmsle(
    df=df_imp,
    df_rmsle=rmsle_df,
    cell_type=ct,
    top_n=15,
    figsize=(20, 18),
    cmap="GnBu",
    save_dir=PLOTS_PATH
)

# %%
# plot heatmap for test 1 results and test 2 results
results_xgb_cnmf = results_xgb
importance_tables_cnmf = collect_importances(results_xgb_cnmf, normalize=True, z_score=False, importance_key="importance")


# %%
import pandas as pd
importance_all_save_path = "/cs/usr/ziv442/projects/results/LR/shap_summary_by_ct.xlsx"
# load previous pipline results
existing_importances_all = pd.read_excel(importance_all_save_path, sheet_name="TNKILC", index_col=0) # dont take the index col

# %%
importance_tables_cnmf['T_cell'].head()

# %%
# create a mutual importance df for T cells across test2, existing MMRp results when the ligands in the intersection of both
common_ligands = existing_importances_all.index.intersection(
    importance_tables_cnmf["T_cell"].index
)

ref = existing_importances_all.loc[common_ligands].copy()
new = importance_tables_cnmf["T_cell"].loc[common_ligands].copy()
ref.columns = ref.columns.map(str)
new.columns = new.columns.map(str)

ref = ref.add_prefix("PelkaAll_")
new = new.add_prefix("CNMF_")

# combine
mutual = pd.concat([ref, new], axis=1).fillna(0)

# normalize columns
col_sums = mutual.sum(axis=0).replace(0, np.nan)
mutual = mutual.div(col_sums, axis=1).fillna(0)

mutual_importance_df_cnmf_All = mutual


# %%
# print mutual_importance_df_cnmf_All columns
print("Mutual importance df columns:", mutual_importance_df_cnmf_All.columns.tolist())

# %%
import numpy as np
import pandas as pd

def compute_program_similarity_matrix(
    mutual_importance_df: pd.DataFrame,
    prefix_ref: str = "PelkaAll",
    prefix_new: str = "CNMF",
    metric: str = "cosine",          # "cosine" or "spearman"
    fillna_value: float = 0.0,
) -> pd.DataFrame:
    """
    All-vs-all similarity between reference and new programs using ligand-importance vectors.

    Rows  = ref programs (bare names)
    Cols  = new programs (bare names)
    """

    # 1) pick columns
    ref_cols = [c for c in mutual_importance_df.columns if c.startswith(prefix_ref + "_")]
    new_cols = [c for c in mutual_importance_df.columns if c.startswith(prefix_new + "_")]
    if not ref_cols or not new_cols:
        raise ValueError(f"Found ref={len(ref_cols)} new={len(new_cols)} columns for prefixes "
                         f"{prefix_ref!r}, {prefix_new!r}")
    
    print(f"Computing similarity matrix between {len(ref_cols)} reference programs and {len(new_cols)} new programs...")
    ref_names = [c[len(prefix_ref) + 1:] for c in ref_cols]
    new_names = [c[len(prefix_new) + 1:] for c in new_cols]

    # 2) numeric + fillna
    A = mutual_importance_df[ref_cols].apply(pd.to_numeric, errors="coerce").fillna(fillna_value).to_numpy(float)
    B = mutual_importance_df[new_cols].apply(pd.to_numeric, errors="coerce").fillna(fillna_value).to_numpy(float)
    # shapes: (n_ligands, n_ref) and (n_ligands, n_new)

    if metric == "cosine":
        # cosine = (A/||A||)^T (B/||B||)
        An = np.linalg.norm(A, axis=0)
        Bn = np.linalg.norm(B, axis=0)

        A_unit = np.divide(A, An, where=An > 0, out=np.zeros_like(A))
        B_unit = np.divide(B, Bn, where=Bn > 0, out=np.zeros_like(B))

        sim = A_unit.T @ B_unit
        sim[An == 0, :] = np.nan
        sim[:, Bn == 0] = np.nan

    elif metric == "spearman":
        # Spearman = Pearson correlation of ranks
        R = pd.DataFrame(
            np.hstack([A, B]),
            columns=ref_cols + new_cols
        ).rank(method="average").to_numpy(float)

        Rref = R[:, :len(ref_cols)]
        Rnew = R[:, len(ref_cols):]

        # center columns
        Rref -= Rref.mean(axis=0, keepdims=True)
        Rnew -= Rnew.mean(axis=0, keepdims=True)

        sref = Rref.std(axis=0, ddof=1)
        snew = Rnew.std(axis=0, ddof=1)

        Rref_z = np.divide(Rref, sref, where=sref > 0, out=np.zeros_like(Rref))
        Rnew_z = np.divide(Rnew, snew, where=snew > 0, out=np.zeros_like(Rnew))

        # correlation across ligands
        sim = (Rref_z.T @ Rnew_z) / (Rref_z.shape[0] - 1)
        sim[sref == 0, :] = np.nan
        sim[:, snew == 0] = np.nan

    else:
        raise ValueError("metric must be 'cosine' or 'spearman'")

    return pd.DataFrame(sim, index=ref_names, columns=new_names)

# %% [markdown]
# compare W

# %% [markdown]
# bar plot of what is most similar

# %% [markdown]
# p value empiric

# %% [markdown]
# loss per patient -> in diff for each immune cells and cancer cells

# %% [markdown]
# explined variance

# %% [markdown]
# 

# %% [markdown]
# # do cosine similarity and spearman by W matrics

# %%
import numpy as np
import pandas as pd
from scipy.stats import rankdata

def program_similarity_W(
    W_ref: pd.DataFrame,
    W_new: pd.DataFrame,
    metric: str = "cosine",
) -> pd.DataFrame:
    """
    All-vs-all similarity between programs using W (rows=genes, cols=programs).
    Returns a full matrix: rows=W_ref.columns, cols=W_new.columns.
    metric: 'cosine' or 'spearman'
    """
    # align genes
    common = W_ref.index.intersection(W_new.index)
    W_ref2 = W_ref.loc[common]
    W_new2 = W_new.loc[common].reindex(W_ref2.index)

    X = W_ref2.to_numpy(dtype=float)  # genes x n_ref
    Y = W_new2.to_numpy(dtype=float)  # genes x n_new
    n = X.shape[0]
    if n < 2:
        return pd.DataFrame(index=W_ref2.columns, columns=W_new2.columns, dtype=float)

    if metric == "cosine":
        Xn = X / np.linalg.norm(X, axis=0, keepdims=True)
        Yn = Y / np.linalg.norm(Y, axis=0, keepdims=True)
        sim = Xn.T @ Yn

    elif metric == "spearman":
        Xr = np.apply_along_axis(rankdata, 0, X, method="average")
        Yr = np.apply_along_axis(rankdata, 0, Y, method="average")

        Xz = (Xr - Xr.mean(axis=0, keepdims=True)) / Xr.std(axis=0, ddof=1, keepdims=True)
        Yz = (Yr - Yr.mean(axis=0, keepdims=True)) / Yr.std(axis=0, ddof=1, keepdims=True)

        sim = (Xz.T @ Yz) / (n - 1)

    else:
        raise ValueError("metric must be 'cosine' or 'spearman'")

    return pd.DataFrame(sim, index=W_ref2.columns, columns=W_new2.columns)

# %%
import re
from typing import Dict, Optional

def shorten_name(s: str, canonical_by_prefix: Optional[Dict[str, str]] = None) -> str:
    """
    Shorten program name, and אם יש מיפוי קנוני לפי prefix (למשל 'pTNI09'),
    מאחד את כל השמות אליו (לפי test2).
    """
    # --- שלב 1: קיצור השם כמו קודם ---
    m = re.search(r'\(([^)]+)\)', s)
    if m:
        inner = m.group(1).strip()
        if ',' in inner:
            # comma-separated -> keep items as tokens joined by underscore
            inner_clean = re.sub(r'[^0-9A-Za-z,]+', '_', inner)
            inner_clean = inner_clean.replace(',', '_').strip('_')
        else:
            # no comma: treat '-' as '_' but remove spaces
            # e.g. "gd-like T" -> "gd_likeT", "innate T" -> "innateT"
            inner_mod = inner.replace('-', '_')
            inner_clean = re.sub(r'[^0-9A-Za-z_]+', '', inner_mod)

        s = re.sub(r'\s*\([^)]+\)', '_' + inner_clean, s, count=1)

    # ניקוי כללי
    s = re.sub(r'[^0-9A-Za-z_]+', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')

    # --- שלב 2: איחוד לשם קנוני לפי prefix (לפי test2) ---
    if canonical_by_prefix:
        # מוצאים את ה-prefix: pTNI + מספרים
        m_prefix = re.match(r'(pTNI\d+)', s)
        if m_prefix:
            prefix = m_prefix.group(1)
            if prefix in canonical_by_prefix:
                return canonical_by_prefix[prefix]

    return s


# %%
# load H of pelkas
# "nmf_T_cell": f"{BASE_PATH}../ccNMF_CellAct_Hmat/ccNMF_cell_T.csv.gz"
BASE_PATH = "/sci/labs/matanh/projects/crcGexWes/data/PelkaCell2021/colon10x_default/"
H_T_pelka = pd.read_csv(
    f"{BASE_PATH}../ccNMF_CellAct_Hmat/ccNMF_cell_T.csv.gz",
    index_col=0
)
print("H_T_pelka shape:", H_T_pelka.shape)
W_T_pelka = pd.read_csv(
    f"{BASE_PATH}../ccNMF_GeneWeight_Wmat/ccNMF_RawWeights_T.csv.gz",
    index_col=0
)
print("W_T_pelka shape:", W_T_pelka.shape)

# %%
import pandas as pd
import numpy as np

def build_W_from_program_top_genes(
    programs_top_genes: pd.DataFrame,
    W_full: pd.DataFrame,
    shorten_fn=None,
    top_k: int | None = None,
    dropna: bool = True,
    keep_column_norm: bool = True,
) -> pd.DataFrame:
    """
    Build a reduced W using only top genes per program, keeping
    the original cNMF weights (and optionally the original column scale).
    """
    # Map Excel column names → program names
    excel_cols = list(programs_top_genes.columns)
    prog_names = (
        [shorten_fn(str(c)) for c in excel_cols]
        if shorten_fn is not None
        else [str(c) for c in excel_cols]
    )

    # Collect gene lists per program
    prog_to_genes: dict[str, list[str]] = {}
    for src_col, prog in zip(excel_cols, prog_names):
        vals = programs_top_genes[src_col]
        genes = [g for g in vals.tolist() if (not dropna or pd.notna(g))]
        if top_k is not None:
            genes = genes[:top_k]
        # ensure unique genes per program (Excel can have duplicates)
        genes_unique = list(dict.fromkeys(genes))
        prog_to_genes[prog] = genes_unique

    # Union of all selected genes that exist in W_full
    all_genes = sorted(
        {
            g
            for genes in prog_to_genes.values()
            for g in genes
            if g in W_full.index
        }
    )
    W_sub = pd.DataFrame(0.0, index=all_genes, columns=prog_names)

    # Fill with original weights from W_full
    W_full = W_full[~W_full.index.duplicated(keep="first")]

    for prog in prog_names:
        if prog not in W_full.columns:
            # skip programs that are not present in W_full
            continue
        genes = [g for g in prog_to_genes[prog] if g in W_sub.index]
        if not genes:
            continue
        # use .values to avoid index alignment issues
        W_sub.loc[genes, prog] = W_full.loc[genes, prog].values

    # Optionally preserve original column sums (scale)
    if keep_column_norm:
        for prog in prog_names:
            if prog not in W_full.columns:
                continue
            orig_sum = W_full[prog].sum()
            new_sum = W_sub[prog].sum()
            if new_sum > 0 and not np.isclose(orig_sum, new_sum):
                W_sub[prog] *= orig_sum / new_sum

    return W_sub


# %%

# load cs/usr/ziv442/projects/raw_data/LR/1-s2.0-S0092867421009454-mmc2.xlsx
import pandas as pd
excel_path = "/cs/usr/ziv442/projects/raw_data/LR/1-s2.0-S0092867421009454-mmc2.xlsx"
programms_top_genes = pd.read_excel(excel_path, sheet_name="D. Program top genes")  # Load all sheets

# %%

pTNI_cols = [c for c in programms_top_genes.columns if c.startswith("pTNI")]
pTNI_df = programms_top_genes[pTNI_cols].copy()

rename_map = {c: shorten_name(c) for c in pTNI_cols}
pTNI_df.rename(columns=rename_map, inplace=True)
if pTNI_df.columns.duplicated().any():
    pTNI_df = pTNI_df.T.groupby(level=0).apply(lambda x: x.stack().reset_index(drop=True)).T
# perform shorten on W_T_pelka columns as well

# %%
def subset_adata_T_cells(adata, obs_key="cell_type", ct_value="T_cell"):
    if obs_key not in adata.obs.columns:
        raise ValueError(f"{obs_key} not found in adata.obs.columns")
    mask = adata.obs[obs_key] == ct_value
    adata_T = adata[mask].copy()
    print(f"[subset_adata_T_cells] kept {adata_T.n_obs} cells with {obs_key} == '{ct_value}'.")
    return adata_T

adata_T = subset_adata_T_cells(adata, obs_key="cell_type", ct_value="T_cell")

# %%
import numpy as np

# 0) תמיד אחרי טעינה מהדיסק!
rename_fix = {
    "pTNI09_Elongationfactors": "pTNI09_Translation",
    "pTNI10": "pTNI10_glycolysis",
    "pTNI11": "pTNI11_mitochondrial",
}
W_T_pelka = W_T_pelka.rename(columns=rename_fix)

# 1) לבנות מחדש W מהאקסל (חייב אחרי ה-rename)
W_excel_T = build_W_from_program_top_genes(
    programs_top_genes=pTNI_df,
    W_full=W_T_pelka,
    shorten_fn=None,
    top_k=None,
    dropna=True,
    keep_column_norm=False
)

# 2) לבנות מחדש W_T_sub לפי adata_T
genes_T = sorted(set(W_excel_T.index) & set(adata_T.var_names))
W_T_sub = W_excel_T.loc[genes_T].copy()



# %%
program_similarity_W(
    W_ref=W_T_sub,
    W_new=cnmf_results_test1["T_cell"]["W_tpm"],
    metric="cosine",
)


# %%
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

sns.set(style="whitegrid")

def plot_full_similarity_heatmaps_both(
    sim_cos,
    sim_spear,
    pelka_type="MMRp",
    new_name="NNLSW",
    figsize=(16, 6),
    order_mode="hungarian",   # "hungarian" / "graded" / "none"
    base_for_order="cosine",  # "cosine" / "spearman_abs"
):
    """
    Side-by-side heatmaps of cosine and spearman similarity matrices, with optional
    diagonal/graded ordering.

    sim_cos   : DataFrame (rows=Pelka programs, cols=new programs)
    sim_spear : same shape/index/columns (spearman)
    """

    # --- align index/columns ---
    common_rows = sim_cos.index.intersection(sim_spear.index)
    common_cols = sim_cos.columns.intersection(sim_spear.columns)
    sim_cos   = sim_cos.loc[common_rows, common_cols].copy()
    sim_spear = sim_spear.loc[common_rows, common_cols].copy()

    # --- choose matrix for ordering ---
    if base_for_order == "spearman_abs":
        base = sim_spear.abs().fillna(0)
    else:
        base = sim_cos.fillna(0)

    rows_order = list(sim_cos.index)
    cols_order = list(sim_cos.columns)

    # --- ordering to make it more diagonal/graded ---
    if order_mode == "hungarian":
        try:
            from scipy.optimize import linear_sum_assignment

            M = base.values
            # maximize similarity -> minimize negative
            row_ind, col_ind = linear_sum_assignment(-M)

            # sort pairs by assigned column index so diagonal goes left->right
            pairs = sorted(zip(row_ind, col_ind), key=lambda x: x[1])

            rows_order = [base.index[i] for i, j in pairs]
            cols_order = [base.columns[j] for i, j in pairs]

            # if rectangular (extra cols/rows), append leftovers by "best hit"
            leftover_rows = [r for r in base.index if r not in rows_order]
            leftover_cols = [c for c in base.columns if c not in cols_order]

            if leftover_rows:
                # sort leftover rows by where their best column is
                pos = base.loc[leftover_rows].values.argmax(axis=1)
                leftover_rows = [x for _, x in sorted(zip(pos, leftover_rows))]
                rows_order += leftover_rows

            if leftover_cols:
                # sort leftover cols by where their best row is
                pos = base[leftover_cols].values.argmax(axis=0)
                leftover_cols = [x for _, x in sorted(zip(pos, leftover_cols))]
                cols_order += leftover_cols

        except Exception as e:
            print(f"[warn] Hungarian ordering failed ({e}). Falling back to graded ordering.")
            order_mode = "graded"

    if order_mode == "graded":
        # sort rows by the position of their strongest similarity (argmax) + strength
        M = base.values
        row_pos = M.argmax(axis=1)
        row_max = M.max(axis=1)
        row_sort = np.lexsort((-row_max, row_pos))  # primary: argmax position, secondary: max value
        rows_order = base.index[row_sort].tolist()

        # sort columns similarly
        col_pos = M.argmax(axis=0)
        col_max = M.max(axis=0)
        col_sort = np.lexsort((-col_max, col_pos))
        cols_order = base.columns[col_sort].tolist()

    # --- apply ordering to both matrices ---
    sim_cos_o   = sim_cos.loc[rows_order, cols_order]
    sim_spear_o = sim_spear.loc[rows_order, cols_order]

    # --- plot ---
    fig, axes = plt.subplots(1, 2, figsize=figsize, constrained_layout=True)

    # cosine
    vmax_cos = sim_cos_o.quantile(0.95).max()
    sns.heatmap(
        sim_cos_o,
        ax=axes[0],
        cmap="GnBu",
        vmin=0,
        vmax=vmax_cos,
        xticklabels=True,
        yticklabels=True,
        cbar_kws={"label": "cosine"},
    )
    axes[0].set_title(f"Cosine similarity: Pelka {pelka_type} vs {new_name}")
    axes[0].set_xlabel(f"{new_name} programs")
    axes[0].set_ylabel(f"Pelka {pelka_type} programs")
    axes[0].tick_params(axis="x", rotation=45)
    axes[0].tick_params(axis="y", rotation=0)

    # spearman
    max_abs_spear = np.quantile(sim_spear_o.abs().values.flatten(), 0.95)
    sns.heatmap(
        sim_spear_o,
        ax=axes[1],
        cmap="GnBu",
        vmin=-max_abs_spear,
        vmax=max_abs_spear,
        xticklabels=True,
        yticklabels=True,
        cbar_kws={"label": "spearman"},
    )
    axes[1].set_title(f"Spearman similarity: Pelka {pelka_type} vs {new_name}")
    axes[1].set_xlabel(f"{new_name} programs")
    axes[1].set_ylabel(f"Pelka {pelka_type} programs")
    axes[1].tick_params(axis="x", rotation=45)
    axes[1].tick_params(axis="y", rotation=0)

    plt.show()


# %%
sim_cos = program_similarity_W(
    W_ref=W_T_sub,
    W_new=cnmf_results_test1["T_cell"]["W_tpm"],
    metric="cosine",
)

sim_spear = program_similarity_W(
    W_ref=W_T_sub,
    W_new=cnmf_results_test1["T_cell"]["W_tpm"],
    metric="spearman",
)

plot_full_similarity_heatmaps_both(
    sim_cos=sim_cos,
    sim_spear=sim_spear,
    pelka_type="T",
    new_name="CNMF_test1",
    order_mode="hungarian"
)

# %%
import numpy as np
import pandas as pd
import shap

def build_shap_summaries_from_results(
    results_xgb,
    mean_expr_celltype,
    top_n=10,
    make_plots=True,
    plot_type="dot",
):
    """
    Build SHAP summary tables directly from results_xgb.

    Returns
    -------
    all_shap : DataFrame
        Long table with columns: ct, program, feature, mean_abs_shap.
    topn : DataFrame
        Top-N features per (ct, program).
    topn_by_program : dict[str, DataFrame]
        Key = program, value = all top-N rows for that program (across ct).
    topn_by_ct_program : dict[str, dict[str, DataFrame]]
        Nested dict: ct -> program -> top-N DataFrame.
    """
    rows = []
    topn_by_ct_program = {}

    for ct, programs in results_xgb.items():
        if ct not in mean_expr_celltype:
            print(f"Skipping {ct}: not found in mean_expr_celltype")
            continue

        X_ct = mean_expr_celltype[ct].copy()
        X_ct = X_ct.apply(pd.to_numeric, errors="coerce")

        topn_by_ct_program[ct] = {}

        for prog_name, metrics in programs.items():
            model = metrics.get("model")
            if model is None:
                print(f"Skipping {ct}/{prog_name}: no trained model")
                continue

            feature_names = model.feature_names
            if feature_names is None:
                feature_names = X_ct.columns.tolist()
            feature_names = [f for f in feature_names if f in X_ct.columns]

            if not feature_names:
                print(f"Skipping {ct}/{prog_name}: no matching feature names")
                continue

            X_use = X_ct[feature_names].dropna()
            if X_use.empty:
                print(f"Skipping {ct}/{prog_name}: no rows left after dropna")
                continue

            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_use)

            # Handle outputs that may come as list for some model/objective combinations
            if isinstance(shap_values, list):
                shap_values = shap_values[0]

            shap_values = np.asarray(shap_values)
            mean_abs = np.abs(shap_values).mean(axis=0)

            prog_df = pd.DataFrame({
                "ct": ct,
                "program": str(prog_name),
                "feature": feature_names,
                "mean_abs_shap": mean_abs,
            }).sort_values("mean_abs_shap", ascending=False)

            rows.append(prog_df)
            topn_by_ct_program[ct][str(prog_name)] = prog_df.head(top_n).reset_index(drop=True)

            if make_plots:
                print(f"Generating SHAP summary for {ct}/{prog_name}...")
                shap.summary_plot(
                    shap_values,
                    X_use,
                    plot_type=plot_type,
                    max_display=top_n,
                )

    all_shap = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(
        columns=["ct", "program", "feature", "mean_abs_shap"]
    )

    topn = (
        all_shap.sort_values(["ct", "program", "mean_abs_shap"], ascending=[True, True, False])
                .groupby(["ct", "program"], as_index=False, group_keys=False)
                .head(top_n)
                .reset_index(drop=True)
    ) if not all_shap.empty else all_shap.copy()

    topn_by_program = {
        program: group.reset_index(drop=True)
        for program, group in topn.groupby("program", sort=False)
    }

    return all_shap, topn, topn_by_program, topn_by_ct_program


all_shap, top100, top100_by_program, top100_by_ct_program = build_shap_summaries_from_results(
    results_xgb=results_xgb,
    mean_expr_celltype=mean_expr_celltype,
    top_n=100,
    make_plots=True,
    plot_type="dot",
)

top100_by_program

# %%
# save all shaft csv as is
all_shap.to_csv("all_shap_summary_lung.csv", index=False)

# %%
import pandas as pd
SHEET_NAME = "all_protein"
# 1. Load the Excel sheet from the PREVIOUS dataset (T cells)
# Make sure the filename matches what you saved earlier
excel_path = f"/cs/usr/ziv442/projects/code/LR/top100_features_{SHEET_NAME}.xlsx"
old_t_cells = pd.read_excel(excel_path, sheet_name="TNKILC")

# 2. Get the list of unique programs in the NEW dataset for T cells
# (Assuming your new 'top10_by_program' contains the T cell programs)
comparison_results = []

for prog_name, new_df in top100_by_program.items():
    # Filter the OLD data for this specific program
    old_prog_genes = set(old_t_cells[old_t_cells['program'] == prog_name]['feature'])
    
    # Get the genes from the NEW data
    new_prog_genes = set(new_df['feature'])
    
    # Find the intersection
    common_genes = old_prog_genes.intersection(new_prog_genes)
    
    comparison_results.append({
        "program": prog_name,
        "n_common": len(common_genes),
        "common_genes": ", ".join(common_genes),
        "overlap_pct": (len(common_genes) / 100) * 100
    })

# 3. View the comparison
comparison_df = pd.DataFrame(comparison_results)
print(comparison_df)

# %%
global_common = ['TNFRSF11B', 'IL1R2', 'MICA', 'RORB', 'ABCA1', 'RLN2', 'TNFRSF10A', 'RORA', 'PLXNB2', 'SFRP4', 'NR3C2', 'CCRL2', 'CEACAM1', 'CXCR6', 'AGRN', 'FGFR4', 'TNFRSF10C', 'ITGAM', 'TNFRSF21', 'RNASET2', 'THRA', 'TNFSF12', 'NR1H2', 'WNT9A', 'PODXL', 'RORC', 'COL17A1', 'IL5RA', 'NR1H3', 'FGFR2', 'CCL15', 'HLA-C', 'TNFRSF1A', 'COL28A1', 'ESR1', 'UTS2', 'IL27RA', 'RAMP3', 'ATP6AP2', 'VDR', 'BMPR1B', 'NR3C1', 'IL23A', 'AGRP', 'EREG']


# %%
import seaborn as sns
import matplotlib.pyplot as plt
import numpy as np

# 1. Prepare data (same as before)
common_genes_list = list(global_common)
heatmap_data = pd.DataFrame(0.0, index=common_genes_list, columns=top100_by_program.keys())

for prog, df in top100_by_program.items():
    for gene in common_genes_list:
        if gene in df['feature'].values:
            val = df.loc[df['feature'] == gene, 'mean_abs_shap'].values[0]
            heatmap_data.loc[gene, prog] = val

# 2. Cut the upper quantile (e.g., 95th) to handle outliers and improve contrast
v_max = np.quantile(heatmap_data.values[heatmap_data.values > 0], 0.95)

# 3. Create the Clustermap
g = sns.clustermap(
    heatmap_data,
    cmap="GnBu",             # Requested GnBu color palette
    vmax=v_max,              # Clip upper quantile for better visual range
    standard_scale=None,     # Keep raw SHAP values for biological magnitude
    method='ward',           # Robust clustering method
    metric='euclidean',
    figsize=(14, 10),
    cbar_kws={'label': 'Mean Abs SHAP (Clipped at 95th Quantile)'},
    dendrogram_ratio=(0.15, 0.15), # Make dendrograms smaller to focus on data
    linewidths=0.5,
    linecolor='gray'
)

# Rotate labels for better readability
plt.setp(g.ax_heatmap.get_xticklabels(), rotation=45, ha='right')
g.fig.suptitle("Clustered Shared Proteins: T-Cell Program Patterns", y=1.02, fontsize=16)

plt.show()

# %%
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import average_precision_score, f1_score
from sklearn.model_selection import StratifiedKFold

# %%
def test_ranking_depth(all_shap_df, target_ct, target_program, hypo_genes):
    """Checks the rank of the 72 genes within the full feature list by SHAP."""
    # Filter for the specific program
    prog_data = all_shap_df[(all_shap_df['ct'] == target_ct) & 
                            (all_shap_df['program'] == target_program)].copy()
    
    # Sort by absolute SHAP value
    prog_data['rank'] = prog_data['mean_abs_shap'].rank(ascending=False)
    
    # Get ranks of our 72 genes
    hypo_ranks = prog_data[prog_data['feature'].isin(hypo_genes)]
    
    avg_rank = hypo_ranks['rank'].mean()
    top_rank = hypo_ranks['rank'].min()
    
    print(f"--- Ranking Check: {target_program} ---")
    print(f"Average Rank of 72 genes: {avg_rank:.2f}")
    print(f"Top Gene Rank: {top_rank},feature name is {hypo_ranks.loc[hypo_ranks['rank'] == top_rank, 'feature'].values[0]}")
    return hypo_ranks.sort_values('rank')

# %%
from sklearn.model_selection import KFold
from sklearn.metrics import mean_squared_error
import numpy as np
import xgboost as xgb
import pandas as pd

def run_regression_comparison(X, y, hypo_genes):
    """
    Compares Full vs. Ablated vs. Minimal Signature models for REGRESSION.
    Evaluation metric: RMSE (lower is better).
    """
    results = {}
    
    # Ensure hypo_genes only includes genes actually present in X
    available_hypo = [c for c in hypo_genes if c in X.columns]
    
    feature_sets = {
        "Full (All Ligands)": X.columns.tolist(),
        "Ablated (Everything EXCEPT 72)": [c for c in X.columns if c not in available_hypo],
        "Minimal Signature (ONLY 72)": available_hypo
    }
    
    # If sample size is very small, use 3 folds
    n_splits = 5 if len(X) > 15 else 3
    kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)
    
    print(f"--- Running Regression Comparison (n={len(X)} patients, folds={n_splits}) ---")

    for name, f_list in feature_sets.items():
        if not f_list:
            results[name] = np.nan
            continue
            
        cv_rmse = []
        
        for train_idx, val_idx in kf.split(X):
            model = xgb.XGBRegressor(
                n_estimators=100,
                learning_rate=0.05,
                max_depth=3,
                n_jobs=-1,
                random_state=42
            )
            
            model.fit(X[f_list].iloc[train_idx], y.iloc[train_idx])
            preds = model.predict(X[f_list].iloc[val_idx])
            
            rmse = np.sqrt(mean_squared_error(y.iloc[val_idx], preds))
            cv_rmse.append(rmse)
        
        results[name] = float(np.mean(cv_rmse))
        print(f"{name:35} | RMSE: {results[name]:.4f}")
        
    return results

def _canon_col(v):
    """Canonicalize labels so 1, '1', and '1.0' can be matched consistently."""
    s = str(v).strip()
    try:
        f = float(s)
        if f.is_integer():
            return str(int(f))
    except Exception:
        pass
    return s


# --- Example ---
comparison_rows = []

# Build a robust lookup from canonical label -> actual Y column name.
y_lookup = {}
for c in Y.columns:
    y_lookup[_canon_col(c)] = c

for name, df in top10_by_program.items():
    key = _canon_col(name)
    if key not in y_lookup:
        print(f"Skipping program {name}: no matching column in Y")
        continue

    y_col = y_lookup[key]
    comp_results = run_regression_comparison(X, Y[y_col], global_common)
    comparison_rows.append({
        "program": str(name),
        "y_column_used": str(y_col),
        **comp_results
    })

regression_comparison_df = pd.DataFrame(comparison_rows)
regression_comparison_df

# %%
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

def visualize_vertical_leaderboard(all_shap_df, target_ct, hypo_genes):
    # 1. Prepare Data
    summary_list = []
    programs = sorted(all_shap_df[all_shap_df['ct'] == target_ct]['program'].unique())
    
    for prog in programs:
        prog_data = all_shap_df[(all_shap_df['ct'] == target_ct) & (all_shap_df['program'] == prog)].copy()
        prog_data['rank'] = prog_data['mean_abs_shap'].rank(ascending=False)
        
        hypo_ranks = prog_data[prog_data['feature'].isin(hypo_genes)].sort_values('rank')
        
        if not hypo_ranks.empty:
            top_row = hypo_ranks.iloc[0]
            summary_list.append({
                "Program": prog,
                "Top_Gene": top_row['feature'],
                "Rank": top_row['rank'],
                "SHAP": top_row['mean_abs_shap']
            })

    df = pd.DataFrame(summary_list)

    # 2. Plotting
    plt.figure(figsize=(14, 7))
    
    # Use log scale so Rank 1 and Rank 600 are both visible
    # We use (Rank) as height, then invert so 1 is at the top
    sns.barplot(data=df, x='Program', y='Rank', palette='GnBu_d', alpha=0.8)
    
    plt.yscale('log') # Essential for seeing Rank 1 vs Rank 600
    plt.gca().invert_yaxis()
    
    # Customizing Labels
    plt.xticks(rotation=45, ha='right', fontsize=10)
    plt.ylabel("Rank (Top is Better / #1)", fontsize=12)
    plt.title(f"Primary Drivers from 72-Gene Set across {target_ct}", fontsize=16, pad=20)

    # Adding the "Relevant Info" labels on top of bars
    for i, row in df.iterrows():
        plt.text(i, row['Rank'], f" {row['Top_Gene']}\n(#{int(row['Rank'])})", 
                 ha='center', va='bottom', fontsize=9, fontweight='bold', rotation=0)

    plt.grid(axis='y', linestyle='--', alpha=0.3, which='both')
    sns.despine()
    plt.tight_layout()
    plt.show()

# Execute
visualize_vertical_leaderboard(all_shap, "T_cell", global_common)

# %%
import matplotlib.pyplot as plt
import seaborn as sns

def visualize_top3_clean_list(all_shap_df, target_ct, hypo_genes):
    # 1. Prepare data
    programs = sorted(all_shap_df[all_shap_df['ct'] == target_ct]['program'].unique())
    n_progs = len(programs)
    cols = 3
    rows = (n_progs // cols) + (1 if n_progs % cols != 0 else 0)

    fig, axes = plt.subplots(rows, cols, figsize=(18, rows * 2.5))
    axes = axes.flatten()

    for i, prog in enumerate(programs):
        ax = axes[i]
        
        # Get data and rank
        prog_data = all_shap_df[(all_shap_df['ct'] == target_ct) & (all_shap_df['program'] == prog)].copy()
        prog_data['rank'] = prog_data['mean_abs_shap'].rank(ascending=False)
        
        # Get Top 3 from your 72 genes
        top3 = prog_data[prog_data['feature'].isin(hypo_genes)].sort_values('rank').head(3)
        
        if not top3.empty:
            # We plot (20 - rank) so that Rank 1 is the longest bar
            # Any rank > 20 will just show as a very tiny bar
            display_scores = [max(0.5, 20 - r) for r in top3['rank']]
            labels = [f"{row['feature']} (Rank {int(row['rank'])})" for _, row in top3.iterrows()]
            
            ax.barh(labels, display_scores, color='teal', alpha=0.6)
            ax.set_title(prog, fontweight='bold', fontsize=12, loc='left')
            ax.set_xlim(0, 20)
            ax.invert_yaxis() # Highest rank at the top
        
        # Clean up each subplot
        ax.set_xticks([])
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['bottom'].set_visible(False)

    # Hide unused subplots
    for j in range(i + 1, len(axes)):
        axes[j].axis('off')

    plt.suptitle(f"Top 3 Shared Protein Drivers per Program ({target_ct})", fontsize=20, y=1.02)
    plt.tight_layout()
    plt.show()

visualize_top3_clean_list(all_shap, "T_cell", global_common)

# %%


from importlib.resources import path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

df_comp = regression_comparison_df
plt.figure(figsize=(14, 6))
df_melted = df_comp.melt(id_vars="program", var_name="Model", value_name="RMSE")

df_melted = df_comp.melt(
    id_vars="program",
    value_vars=["Full (All Ligands)", "Ablated (Everything EXCEPT 72)", "Minimal Signature (ONLY 72)"],
    var_name="Model",
    value_name="RMSE",
)
df_melted["RMSE"] = pd.to_numeric(df_melted["RMSE"], errors="coerce")

sns.barplot(data=df_melted, x="program", y="RMSE", hue="Model", palette="viridis")
plt.xticks(rotation=45, ha='right')
plt.title("Model Comparison: Is the 72-Gene Signature Sufficient?")
plt.ylabel("RMSE (Lower is Better)")
plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
plt.tight_layout()
plt.show()

# %% [markdown]
# # DO W COSINE CIMILARITY

# %%
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import scanpy as sc
import seaborn as sns

CNMF_INPUTS_DIR = "/sci/labs/matanh/ziv442/projects/results/LR/Xing_Lung/"
OUTPUT_DIR_CNM = "/cs/usr/ziv442/projects/results/LR/cnmf_results_Xing_Lung/"

xing_h5ad = sc.read_h5ad(Path(CNMF_INPUTS_DIR) / "T_cell.h5ad")
hvg_5000 = xing_h5ad.var_names

xing_w_dir = Path(OUTPUT_DIR_CNM) / "T_cell" / "T_cell_cnmf"
W_files = sorted(xing_w_dir.glob("T_cell_cnmf.gene_spectra_tpm.k_*.txt"))

if not W_files:
    raise FileNotFoundError(f"No XING W file found in {xing_w_dir}")

W_xing = pd.read_csv(W_files[0], sep="\t", index_col=0)
W_xing = W_xing.T 
print("New W_xing index sample:", W_xing.index[:5].tolist())
W_xing = W_xing.apply(pd.to_numeric, errors="coerce").fillna(0.0)

common_hvg = hvg_5000.intersection(W_tpm.index).intersection(W_xing.index)

W_ref_hvg = W_tpm.loc[common_hvg].copy()
W_new_hvg = W_xing.loc[common_hvg].copy()

print(f"Loaded XING W from: {W_files[0]}")
print("XING HVG count:", len(hvg_5000))
print("Shared HVG count:", len(common_hvg))
print("W_ref_hvg shape:", W_ref_hvg.shape)
print("W_new_hvg shape:", W_new_hvg.shape)

sim_cos = program_similarity_W(
    W_ref=W_ref_hvg,
    W_new=W_new_hvg,
    metric="cosine",
)

print("Cosine similarity between W_T_sub and XING W on 5000 HVGs (per program):")
print(sim_cos)

plt.figure(figsize=(12, 8))
sns.heatmap(sim_cos, annot=False, fmt=".2f", cmap="GnBu", cbar_kws={"label": "Cosine Similarity"})
plt.title("Cosine Similarity: W_T_sub vs XING W on 5000 HVGs")
plt.xlabel("XING W programs")
plt.ylabel("W_T_sub programs")
plt.tight_layout()
plt.show()

# %%
print("W_tpm index sample:", W_tpm.index[:5].tolist())
print("W_xing index sample:", W_xing.index[:5].tolist())
print("common_hvg sample:", list(common_hvg)[:5])

# %%
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import numpy as np

def plot_refined_shared_heatmap(old_df, new_dict, target_ct_old):
    # 1. יצירת רשימה של כל הליגנדים שמהווים חיתוך אמיתי לפחות בתוכנית אחת
    strict_shared_genes = set()
    programs = sorted(new_dict.keys())
    
    for prog in programs:
        new_genes = set(new_dict[prog]['feature'])
        old_genes = set(old_df[(old_df['program'] == prog) & 
                               (old_df['ct'] == target_ct_old)]['feature'])
        
        # חיתוך ספציפי לתוכנית הזו
        intersect = new_genes.intersection(old_genes)
        strict_shared_genes.update(intersect)
    
    shared_list = sorted(list(strict_shared_genes))
    
    # 2. בניית המטריצה - רק עבור גנים שהם Shared
    heatmap_data = pd.DataFrame(0.0, index=shared_list, columns=programs)
    
    for prog in programs:
        new_df = new_dict[prog]
        for gene in shared_list:
            # בדיקה אם הגן קיים ב-Top של שניהם עבור התוכנית הזו
            is_in_new = gene in new_df['feature'].values
            is_in_old = gene in old_df[(old_df['program'] == prog) & 
                                       (old_df['ct'] == target_ct_old)]['feature'].values
            
            if is_in_new and is_in_old:
                # נציג את הערך מהדאטה החדש (או ממוצע ביניהם)
                val = new_df.loc[new_df['feature'] == gene, 'mean_abs_shap'].values[0]
                heatmap_data.loc[gene, prog] = val

    # 3. ציור המפה
    if not heatmap_data.empty:
        plt.figure(figsize=(16, 10))
        
        # שימוש ב-standard_scale=0 כדי שנוכל לראות דפוסים גם בליגנדים פחות חזקים
        g = sns.clustermap(
            heatmap_data,
            cmap="YlGnBu",
            standard_scale=0, # מנרמל לפי שורות - מבליט איפה כל גן הכי חזק
            method='ward',
            figsize=(15, 12),
            linewidths=0.5,
            linecolor='white',
            cbar_kws={'label': 'Relative Importance (Shared Only)'}
        )
        
        plt.setp(g.ax_heatmap.get_xticklabels(), rotation=45, ha='right')
        g.fig.suptitle("Strict Intersection: Proteins Shared by Pelka & Lee per Program", 
                     y=1.02, fontsize=16, fontweight='bold')
        plt.show()
    else:
        print("No shared genes found between datasets for these programs.")

# הרצה (תוודא ש-target_ct_old תואם לשם באקסל, למשל "TNKILC")
plot_refined_shared_heatmap(old_t_cells, top10_by_program, "TNKILC")

# %%
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np

def visualize_shared_ranks_per_program(old_df, new_dict, target_ct, global_common, top_n=5):
    # 1. הכנת רשימת התוכניות
    programs = sorted(new_dict.keys())
    n_progs = len(programs)
    cols = 3
    rows = (n_progs // cols) + (1 if n_progs % cols != 0 else 0)

    fig, axes = plt.subplots(rows, cols, figsize=(20, rows * 4))
    axes = axes.flatten()

    for i, prog in enumerate(programs):
        ax = axes[i]
        
        # שליפת נתונים מהדאטה הישן ודירוגם
        old_prog = old_df[(old_df['ct'] == target_ct) & (old_df['program'] == prog)].copy()
        old_prog['rank_old'] = old_prog['mean_abs_shap'].rank(ascending=False)
        
        # שליפת נתונים מהדאטה החדש ודירוגם
        new_prog = new_dict[prog].copy()
        new_prog['rank_new'] = new_prog['mean_abs_shap'].rank(ascending=False)
        
        # מיזוג על בסיס הליגנדים המשותפים בלבד
        merged = pd.merge(
            old_prog[['feature', 'rank_old']], 
            new_prog[['feature', 'rank_new']], 
            on='feature'
        )
        
        # סינון לפי רשימת ה-72 (global_common) ומיון לפי ממוצע הדירוגים
        merged = merged[merged['feature'].isin(global_common)]
        merged['avg_rank'] = (merged['rank_old'] + merged['rank_new']) / 2
        top_shared = merged.sort_values('avg_rank').head(top_n)

        if not top_shared.empty:
            # הכנת נתונים לגרף (Long format עבור Seaborn)
            plot_data = pd.melt(top_shared, id_vars=['feature'], 
                                value_vars=['rank_old', 'rank_new'],
                                var_name='Dataset', value_name='Rank')
            
            # יצירת גרף מוטות - שים לב שאנחנו מציגים את הדירוג
            # נהפוך את הציר כדי שדירוג 1 יהיה בולט
            sns.barplot(data=plot_data, y='feature', x='Rank', hue='Dataset', 
                        palette=['#4C72B0', '#55A868'], ax=ax, orient='h')
            
            # הוספת טקסט עם הדירוג המדויק על המוטות
            for p in ax.patches:
                width = p.get_width()
                if width > 0:
                    ax.text(width + 1, p.get_y() + p.get_height()/2, 
                            f'#{int(width)}', va='center', fontsize=9)

            ax.set_title(f"Program: {prog}", fontweight='bold', fontsize=13)
            ax.set_xlabel("Rank (Lower is Better)")
            ax.set_ylabel("")
            ax.invert_xaxis() # הדירוגים הנמוכים (1, 2) יהיו בצד ימין (יותר בולטים)
            ax.legend(title='', loc='lower right', fontsize='small')
        else:
            ax.text(0.5, 0.5, "No shared genes found", ha='center')
        
        sns.despine()

    # הסתרת תתי-גרפים ריקים
    for j in range(i + 1, len(axes)):
        axes[j].axis('off')

    plt.suptitle(f"Top {top_n} Shared Drivers: Rank Comparison (Old vs New) - {target_ct}", 
                 fontsize=22, y=1.02, fontweight='bold')
    plt.tight_layout()
    plt.show()


visualize_shared_ranks_per_program(
    old_df=old_t_cells,          
    new_dict=top10_by_program,    
    target_ct="TNKILC",           
    global_common=global_common,  
    top_n=10                     
)



# %% [markdown]
# # TILE PIPELINE — Xing2021 + Mynard cNMF integration
# Tile-based MIL regression with patient-safe CV and full SHAP comparison
# - **Mynard** = NMF reference (W/H from cNMF above, W_tpm)
# - **Xing**   = new dataset, projected onto Mynard W via NNLS → H_T_xing

# %%
import glob
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import normalize

# ─── paths ───────────────────────────────────────────────────────────────────
XING_DATA_PATH     = "/cs/usr/ziv442/projects/raw data/Data_Xing2021_Lung"
LIGAND_EXCEL_TILES = "/cs/usr/ziv442/projects/results/LR/cellphonedb_protein_sets.xlsx"
OUTPUT_DIR_TILES   = "/cs/usr/ziv442/projects/results/LR/Xing_Lung/TILES/"
PLOTS_PATH_TILES   = "/cs/usr/ziv442/projects/results/LR/Lung Cancer/plots/TILES/"
SHAP_DIR_TILES     = "/cs/usr/ziv442/projects/results/LR/Lung/shaft_summary/TILE/"
COMPARISON_DIR_LUNG = "TNKILC_Comparison_Results_Lung"
MYNARD_SHAP_CSV    = "all_shap_summary_lung.csv"   # saved above

# ─── tile parameters ──────────────────────────────────────────────────────────
TILE_SIZE_T           = 200
N_TILES_PER_PATIENT_T = 10
MIN_CELLS_PER_TILE_T  = 50

for _p in [OUTPUT_DIR_TILES, PLOTS_PATH_TILES, SHAP_DIR_TILES, COMPARISON_DIR_LUNG]:
    os.makedirs(_p, exist_ok=True)


# %%
# ─────────────────────────────────────────────
#  TILE UTILITY FUNCTIONS
# ─────────────────────────────────────────────

def build_cross_celltype_tiles_lung(
    df_ligands_source: pd.DataFrame,
    df_scores_target: pd.DataFrame,
    patient_col: str,
    tile_size: int = TILE_SIZE_T,
    n_tiles_per_patient: int = N_TILES_PER_PATIENT_T,
    min_cells: int = MIN_CELLS_PER_TILE_T,
    agg: str = "mean",
    random_state: int = 42,
) -> pd.DataFrame:
    """
    Bootstrap tiles by independently sampling source (tumor) and
    target (T-cell) pools per patient.
    Source and target are different cell types — no cell-level pairing.
    """
    rng = np.random.default_rng(random_state)
    records = []
    lig_cols  = [c for c in df_ligands_source.columns if c != patient_col]
    prog_cols = [c for c in df_scores_target.columns  if c != patient_col]
    common_patients = list(
        set(df_ligands_source[patient_col].unique()) &
        set(df_scores_target[patient_col].unique())
    )

    def _agg(arr):
        return arr.mean(axis=0) if agg == "mean" else np.percentile(arr, 75, axis=0)

    for patient in common_patients:
        X = df_ligands_source[df_ligands_source[patient_col] == patient][lig_cols].values.astype(float)
        Y = df_scores_target [df_scores_target [patient_col] == patient][prog_cols].values.astype(float)
        if len(X) < min_cells or len(Y) < min_cells:
            continue
        for k in range(n_tiles_per_patient):
            idx_x = rng.choice(len(X), size=tile_size, replace=True)
            idx_y = rng.choice(len(Y), size=tile_size, replace=True)
            row = {"patient": patient, "tile_id": f"{patient}_tile_{k}"}
            row.update(dict(zip(lig_cols,  _agg(X[idx_x]))))
            row.update(dict(zip(prog_cols, _agg(Y[idx_y]))))
            records.append(row)

    tiles = pd.DataFrame(records)
    if not tiles.empty:
        tiles = tiles.set_index("tile_id")
    print(
        f"Built {len(tiles)} tiles from "
        f"{tiles['patient'].nunique() if not tiles.empty else 0} patients "
        f"(tile_size={tile_size}, n_tiles={n_tiles_per_patient}, agg={agg})"
    )
    return tiles


def patient_train_test_split_t(tiles_df, test_frac=0.2, random_state=42):
    rng      = np.random.default_rng(random_state)
    patients = tiles_df["patient"].unique()
    n_test   = max(1, int(len(patients) * test_frac))
    test_pats  = set(rng.choice(patients, size=n_test, replace=False))
    train_pats = set(patients) - test_pats
    train = tiles_df[tiles_df["patient"].isin(train_pats)]
    test  = tiles_df[tiles_df["patient"].isin(test_pats)]
    print(
        f"Train: {len(train)} tiles / {len(train_pats)} patients | "
        f"Test:  {len(test)} tiles / {len(test_pats)} patients"
    )
    return train, test


def agg_tile_predictions(tile_preds, tile_patients):
    return {
        p: float(np.mean(tile_preds[tile_patients == p]))
        for p in np.unique(tile_patients)
    }


# %%
def run_xgb_regression_tiles_lung(
    tile_data: dict,
    cell_types: list,
    test_size: float = 0.2,
    random_state: int = 42,
) -> dict:
    results_xgb_t = {}
    for ct in cell_types:
        tiles_df = tile_data.get(ct)
        if tiles_df is None or len(tiles_df) == 0:
            print(f"[{ct}] No tiles — skipping."); continue

        ligand_names  = tiles_df.attrs["ligand_cols"]
        program_names = tiles_df.attrs["program_cols"]
        train_tiles, test_tiles = patient_train_test_split_t(
            tiles_df, test_frac=test_size, random_state=random_state
        )
        X_train      = train_tiles[ligand_names].values.astype(float)
        X_test       = test_tiles[ligand_names].values.astype(float)
        groups_train = train_tiles["patient"].values
        n_splits = min(5, train_tiles["patient"].nunique())
        gkf      = GroupKFold(n_splits=n_splits)
        print(f"\n[{ct}] train={len(train_tiles)} tiles / test={len(test_tiles)} tiles / "
              f"train patients={train_tiles['patient'].nunique()}, splits={n_splits}")
        results_xgb_t[ct] = {}
        params = {
            "objective": "reg:squaredlogerror",
            "eval_metric": ["rmsle", "rmse", "mae"],
            "eta": 0.05, "max_depth": 3, "subsample": 0.8,
            "colsample_bytree": 0.7, "reg_lambda": 1.0,
        }
        for prog in program_names:
            y_train = train_tiles[prog].values.astype(float)
            y_test  = test_tiles[prog].values.astype(float)
            best_rounds = []
            for tr_idx, val_idx in gkf.split(X_train, y_train, groups=groups_train):
                dtrain_cv = xgb.DMatrix(X_train[tr_idx], label=y_train[tr_idx], feature_names=ligand_names)
                dval_cv   = xgb.DMatrix(X_train[val_idx], label=y_train[val_idx], feature_names=ligand_names)
                bst_cv    = xgb.train(
                    params=params, dtrain=dtrain_cv,
                    evals=[(dval_cv, "val")],
                    num_boost_round=500, early_stopping_rounds=40,
                    evals_result={}, verbose_eval=False,
                )
                best_rounds.append(bst_cv.best_iteration)
            avg_round = int(np.mean(best_rounds))
            dtrain_full = xgb.DMatrix(X_train, label=y_train, feature_names=ligand_names)
            dtest_full  = xgb.DMatrix(X_test,  label=y_test,  feature_names=ligand_names)
            evals_res   = {}
            booster = xgb.train(
                params=params, dtrain=dtrain_full,
                evals=[(dtest_full, "test")],
                num_boost_round=avg_round + 1,
                evals_result=evals_res, verbose_eval=False,
            )
            y_pred_tile   = booster.predict(dtest_full)
            test_patients = test_tiles["patient"].values
            results_xgb_t[ct][prog] = {
                "rmsle":          evals_res["test"]["rmsle"][-1],
                "rmse":           evals_res["test"]["rmse"][-1],
                "mae":            evals_res["test"]["mae"][-1],
                "y_test_tile":    y_test,
                "y_pred_tile":    y_pred_tile,
                "y_test_patient": agg_tile_predictions(y_test,      test_patients),
                "y_pred_patient": agg_tile_predictions(y_pred_tile, test_patients),
                "best_iteration": avg_round,
                "importance":     booster.get_score(importance_type="gain"),
                "model":          booster,
            }
    return results_xgb_t


# %%
def collect_importances_tiles(results_xgb_t, normalize_cols=True):
    tables = {}
    for ct, prog_dict in results_xgb_t.items():
        df_imp = pd.concat(
            [pd.Series(res.get("importance", {}), name=prog) for prog, res in prog_dict.items()],
            axis=1,
        ).fillna(0)
        if normalize_cols:
            col_sums = df_imp.sum(axis=0).replace(0, 1)
            df_imp   = df_imp.div(col_sums, axis=1)
        tables[ct] = df_imp
    return tables


def plot_importance_heatmap_tiles(df, cell_type, top_n=10, cluster=True,
                                   figsize=(10, 12), save_dir=PLOTS_PATH_TILES):
    top_ligands = set()
    for prog in df.columns:
        top_ligands.update(df[prog].sort_values(ascending=False).head(top_n).index)
    df_top = df.loc[list(top_ligands)]
    df_top = df_top.loc[df_top.max(axis=1).sort_values(ascending=False).index]
    if df_top.empty:
        print(f"No data to plot for {cell_type}. Skipping."); return
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, f"ligand_program_importance_top{top_n}_{cell_type}.png")
    if cluster and df_top.shape[0] > 1 and df_top.shape[1] > 1:
        g = sns.clustermap(df_top, cmap="viridis", figsize=figsize,
                           xticklabels=True, yticklabels=True, method="ward")
        g.fig.suptitle(f"Top {top_n} ligands per program ({cell_type})", y=1.02)
        g.savefig(save_path); plt.close(g.fig)
    else:
        plt.figure(figsize=figsize)
        sns.heatmap(df_top, cmap="viridis", xticklabels=True, yticklabels=True)
        plt.title(f"Top {top_n} ligands per program ({cell_type})")
        plt.tight_layout(); plt.savefig(save_path); plt.close()
    print(f"Heatmap saved → {save_path}")


def build_shap_summaries_tiles(
    results_xgb_t, tile_data, top_n=100, make_plots=True, shap_dir=SHAP_DIR_TILES
):
    rows = []; topn_by_ct_program = {}
    for ct, programs in results_xgb_t.items():
        if ct not in tile_data or tile_data[ct] is None:
            continue
        lig_cols = tile_data[ct].attrs["ligand_cols"]
        X_ct     = tile_data[ct][lig_cols].copy().apply(pd.to_numeric, errors="coerce")
        topn_by_ct_program[ct] = {}
        for prog_name, metrics in programs.items():
            model = metrics.get("model")
            if model is None: continue
            feature_names = [f for f in (model.feature_names or lig_cols) if f in X_ct.columns]
            X_use = X_ct[feature_names].dropna()
            if X_use.empty: continue
            explainer  = shap.TreeExplainer(model)
            shap_vals  = explainer.shap_values(X_use)
            if isinstance(shap_vals, list): shap_vals = shap_vals[0]
            shap_vals  = np.asarray(shap_vals)
            mean_abs   = np.abs(shap_vals).mean(axis=0)
            prog_df = pd.DataFrame({
                "ct": ct, "program": str(prog_name),
                "feature": feature_names, "mean_abs_shap": mean_abs,
            }).sort_values("mean_abs_shap", ascending=False)
            rows.append(prog_df)
            topn_by_ct_program[ct][str(prog_name)] = prog_df.head(top_n).reset_index(drop=True)
            csv_path = os.path.join(shap_dir, f"{ct}_{prog_name}_shap_mean_abs.csv")
            prog_df.to_csv(csv_path, index=False)
            print(f"  SHAP saved → {csv_path}")
            if make_plots:
                shap.summary_plot(shap_vals, X_use, plot_type="dot", max_display=top_n, show=True)
    all_shap_t = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(
        columns=["ct", "program", "feature", "mean_abs_shap"]
    )
    topn = (
        all_shap_t.sort_values(["ct", "program", "mean_abs_shap"], ascending=[True, True, False])
                  .groupby(["ct", "program"], as_index=False, group_keys=False)
                  .head(top_n).reset_index(drop=True)
    ) if not all_shap_t.empty else all_shap_t.copy()
    topn_by_program = {
        prog: grp.reset_index(drop=True)
        for prog, grp in topn.groupby("program", sort=False)
    }
    return all_shap_t, topn, topn_by_program, topn_by_ct_program


def load_shap_dir_t(directory, cell_type_prefix):
    all_files = glob.glob(os.path.join(directory, f"{cell_type_prefix}_*.csv"))
    combined  = []
    for fpath in all_files:
        fname = os.path.basename(fpath)
        parts = fname.replace("_shap_mean_abs.csv", "").split("_")
        df = pd.read_csv(fpath)
        df["program"] = "_".join(parts[1:])
        df["ct"]      = cell_type_prefix
        combined.append(df)
    return pd.concat(combined, ignore_index=True) if combined else pd.DataFrame()


def plot_rmsle_bar_t(results_xgb_t, ct="T_cell", save_dir=PLOTS_PATH_TILES):
    res_ct    = results_xgb_t.get(ct, {})
    rmsle_ser = pd.Series(
        {str(p): r["rmsle"] for p, r in res_ct.items() if "rmsle" in r}, name="rmsle"
    ).sort_values()
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.bar(np.arange(len(rmsle_ser)), rmsle_ser.values, width=0.5)
    ax.set_xticks(np.arange(len(rmsle_ser)))
    ax.set_xticklabels(rmsle_ser.index, rotation=90)
    ax.set_xlabel("Program"); ax.set_ylabel("RMSLE")
    ax.set_title(f"RMSLE per T-cell program (tile-level, {ct})")
    plt.tight_layout()
    os.makedirs(save_dir, exist_ok=True)
    plt.savefig(os.path.join(save_dir, f"rmsle_bar_{ct}.png"), dpi=150)
    plt.show()


# %%
# ─── Comparison plotting functions ────────────────────────────────────────────

def visualize_separate_top_k_raw_highlight_t(mynard_df, xing_df, target_ct, top_k=30):
    p_df     = mynard_df[mynard_df["ct"] == target_ct].copy()
    l_df     = xing_df  [xing_df  ["ct"] == target_ct].copy()
    programs = sorted([p.split("_")[0] for p in p_df["program"].unique()])
    n_progs  = len(programs)
    fig, axes = plt.subplots(n_progs, 2, figsize=(16, n_progs * 4.5))
    if n_progs == 1: axes = np.array([axes])
    for i, prog in enumerate(programs):
        p_top  = p_df[p_df["program"].str.startswith(prog)].nlargest(top_k, "mean_abs_shap").copy()
        l_top  = l_df[l_df["program"].str.startswith(prog)].nlargest(top_k, "mean_abs_shap").copy()
        shared = set(p_top["feature"]) & set(l_top["feature"])
        p_col  = ["#E64B35" if g in shared else "#4C72B0" for g in p_top["feature"]]
        l_col  = ["#E64B35" if g in shared else "#55A868" for g in l_top["feature"]]
        sns.barplot(data=p_top, y="feature", x="mean_abs_shap", palette=p_col,
                    ax=axes[i][0], hue="feature", legend=False)
        axes[i][0].set_title(f"Mynard Raw Top {top_k} — {prog}", fontweight="bold")
        sns.barplot(data=l_top, y="feature", x="mean_abs_shap", palette=l_col,
                    ax=axes[i][1], hue="feature", legend=False)
        axes[i][1].set_title(f"Xing Raw Top {top_k} — {prog}", fontweight="bold")
        for ax in [axes[i][0], axes[i][1]]:
            for tick in ax.get_yticklabels():
                if tick.get_text() in shared:
                    tick.set_fontweight("bold"); tick.set_color("red")
        sns.despine()
    plt.suptitle(f"Side-by-Side Raw Drivers — {target_ct}\n"
                 f"(Red = in Top {top_k} of both datasets)", fontsize=18, y=1.01)
    plt.tight_layout()
    os.makedirs(PLOTS_PATH_TILES, exist_ok=True)
    plt.savefig(os.path.join(PLOTS_PATH_TILES, f"side_by_side_{target_ct}.png"),
                dpi=200, bbox_inches="tight")
    plt.show()


def visualize_shared_shap_zscore_t(mynard_df, xing_df, target_ct, top_n=10):
    def get_zscore(df_sub):
        mu, sigma = df_sub["mean_abs_shap"].mean(), df_sub["mean_abs_shap"].std()
        return (df_sub["mean_abs_shap"] - mu) / (sigma if sigma and not np.isnan(sigma) else 1)

    valid_data = {}
    for prog in sorted(mynard_df[mynard_df["ct"] == target_ct]["program"].unique()):
        p = mynard_df[(mynard_df["ct"] == target_ct) & (mynard_df["program"] == prog)].copy()
        l = xing_df  [(xing_df  ["ct"] == target_ct) & (xing_df  ["program"] == prog)].copy()
        if p.empty or l.empty: continue
        p["z_val"] = get_zscore(p); l["z_val"] = get_zscore(l)
        merged = pd.merge(p[["feature", "z_val"]], l[["feature", "z_val"]],
                          on="feature", suffixes=["_Mynard", "_Xing"])
        if merged.empty: continue
        merged["combined_z"] = (merged["z_val_Mynard"] + merged["z_val_Xing"]) / 2
        valid_data[prog] = merged.sort_values("combined_z", ascending=False).head(top_n)

    if not valid_data:
        print(f"No shared genes found for {target_ct}"); return

    programs = sorted(valid_data.keys())
    n_progs  = len(programs)
    cols = 3; rows = (n_progs // cols) + (1 if n_progs % cols else 0)
    fig, axes = plt.subplots(rows, cols, figsize=(20, rows * 5))
    axes = axes.flatten() if n_progs > 1 else [axes]
    for i, prog in enumerate(programs):
        ax = axes[i]; df_plot = valid_data[prog]
        order = df_plot.sort_values("combined_z", ascending=False)["feature"]
        pd.melt(df_plot, id_vars=["feature"],
                value_vars=["z_val_Mynard", "z_val_Xing"],
                var_name="Dataset", value_name="Z-score").pipe(
            lambda d: sns.barplot(data=d, y="feature", x="Z-score", hue="Dataset",
                                  order=order, palette=["#4C72B0", "#55A868"], ax=ax)
        )
        ax.set_title(f"Program: {prog}", fontweight="bold")
        ax.set_xlabel("Relative Importance (Z-score)"); ax.set_ylabel("")
        ax.axvline(0, color="black", lw=0.8, ls="--")
        ax.legend(title="", loc="lower right"); sns.despine()
    for j in range(i + 1, len(axes)): axes[j].axis("off")
    plt.suptitle(f"Top Shared Drivers by Z-score — {target_ct}", fontsize=20, y=1.02)
    plt.tight_layout(); plt.show()


def save_program_comparisons_lung(mynard_df, xing_df, target_ct, output_dir=COMPARISON_DIR_LUNG):
    os.makedirs(output_dir, exist_ok=True)
    p_ct = mynard_df[mynard_df["ct"] == target_ct].copy()
    l_ct = xing_df  [xing_df  ["ct"] == target_ct].copy()
    common_programs = sorted(set(p_ct["program"]) & set(l_ct["program"]))
    if not common_programs:
        print(f"No common programs for {target_ct}."); return
    for prog in common_programs:
        p_prog = p_ct[p_ct["program"] == prog].copy()
        l_prog = l_ct[l_ct["program"] == prog].copy()
        p_prog["rank_mynard"] = p_prog["mean_abs_shap"].rank(ascending=False, method="min")
        l_prog["rank_xing"]   = l_prog["mean_abs_shap"].rank(ascending=False, method="min")
        merged = pd.merge(
            p_prog[["feature", "rank_mynard", "mean_abs_shap"]],
            l_prog[["feature", "rank_xing",   "mean_abs_shap"]],
            on="feature", suffixes=("_mynard", "_xing")
        )
        merged["avg_rank"] = (merged["rank_mynard"] + merged["rank_xing"]) / 2
        merged.sort_values("avg_rank").to_csv(
            os.path.join(output_dir, f"Program_{prog}_comparison.csv"), index=False
        )
    print(f"Saved {len(common_programs)} comparison CSVs → {output_dir}")


# %%
# ── Load Xing 2021 full dataset ──────────────────────────────────────────────
print("=== Loading Xing 2021 dataset ===")
adata_xing = load_dataset(
    data_path=XING_DATA_PATH,
    cell_id_col="sample",
    merge_samples=True,
)
print(adata_xing)
print("obs columns:", list(adata_xing.obs.columns)[:10])
print("Patients:", adata_xing.obs["patient_x"].nunique(), "unique patients")

adata_xing = preprocess_adata(adata_xing, cell_type=None)

# Clean gene names
adata_xing.var_names = (
    pd.Index(adata_xing.var_names.astype(str))
      .str.strip()
      .str.replace(r'^"+|"+$', "", regex=True)
      .str.replace(r"^'+|'+$", "", regex=True)
)
adata_xing.var_names_make_unique()

# Subset T cells
adata_T_xing = adata_xing[adata_xing.obs["cell_type"] == "T_cell"].copy()
print(f"Xing T cells: {adata_T_xing.n_obs}")


# %%
# ── Build W_T_sub_xing from Mynard cNMF W ────────────────────────────────────
W_T_mynard = cnmf_results_test1["T_cell"]["W_tpm"].copy()
print("Mynard W_tpm shape:", W_T_mynard.shape)

genes_T_xing = sorted(set(W_T_mynard.index) & set(adata_T_xing.var_names))
W_T_sub_xing = W_T_mynard.loc[genes_T_xing].copy()
print(f"Genes W_T_mynard ∩ Xing T cells: {len(genes_T_xing)}")
print("W_T_sub_xing shape:", W_T_sub_xing.shape)

# Cosine / Spearman similarity: Mynard W_sub vs Mynard W_full
W_sub_c  = W_T_sub_xing[~W_T_sub_xing.index.duplicated(keep="first")]
W_full_c = W_T_mynard  [~W_T_mynard  .index.duplicated(keep="first")]
common_g = sorted(set(W_sub_c.index) & set(W_full_c.index))
sim_cos_w   = program_similarity_W(W_sub_c.loc[common_g], W_full_c.loc[common_g], "cosine")
sim_spear_w = program_similarity_W(W_sub_c.loc[common_g], W_full_c.loc[common_g], "spearman")
plot_full_similarity_heatmaps_both(sim_cos_w, sim_spear_w,
                                   pelka_type="Mynard", new_name="W_sub_Xing")


# %%
# ── NNLS projection: Xing T cells onto Mynard W ──────────────────────────────
from scipy.optimize import nnls as _nnls

def project_cells_onto_W_t(X, W_sub, cell_names=None):
    W_mat   = W_sub.to_numpy(dtype=float)
    X_mat   = np.asarray(X, dtype=float)
    n_cells = X_mat.shape[0]
    assert X_mat.shape[1] == W_mat.shape[0], "Gene dimension mismatch"
    H_list  = [_nnls(W_mat, X_mat[i])[0] for i in range(n_cells)]
    H_new   = np.vstack(H_list)
    index   = cell_names if cell_names is not None else pd.RangeIndex(n_cells)
    return pd.DataFrame(H_new, index=index, columns=W_sub.columns)

X_T_raw_xing = adata_T_xing[:, genes_T_xing].X
X_T_xing     = X_T_raw_xing.toarray() if sp.issparse(X_T_raw_xing) else np.asarray(X_T_raw_xing)

zero_progs_xing = W_T_sub_xing.columns[(W_T_sub_xing.sum(axis=0) == 0)].tolist()
print("Dropping all-zero programs:", zero_progs_xing)
W_use_xing      = W_T_sub_xing.drop(columns=zero_progs_xing)
W_use_norm_xing = W_use_xing.div(W_use_xing.sum(axis=0), axis=1)

H_T_xing = project_cells_onto_W_t(X_T_xing, W_use_norm_xing, cell_names=adata_T_xing.obs_names)
print("H_T_xing shape:", H_T_xing.shape)
print(H_T_xing.head())


# %%
# ── L2-normalise W and H → cnmf_results_xing ─────────────────────────────────
W_xing_l2 = pd.DataFrame(
    normalize(W_T_sub_xing.values, norm="l2", axis=0),
    index=W_T_sub_xing.index, columns=W_T_sub_xing.columns,
)
row_norms_xing = np.sqrt((H_T_xing ** 2).sum(axis=1)).replace(0, 1)
H_xing_l2      = H_T_xing.div(row_norms_xing, axis=0)

cnmf_results_xing = {"T_cell": {"H": H_xing_l2, "W": W_xing_l2}}


# %%
# ── Extract ligand expression for all Xing cells ──────────────────────────────
ligands_df_raw_x   = pd.read_excel(LIGAND_EXCEL_TILES, sheet_name=SHEET_NAME)
ligands_gene_names_x = ligands_df_raw_x["symbol"].dropna().unique().tolist()
ligand_genes_xing    = [g for g in ligands_gene_names_x if g in adata_xing.var_names]
print(f"Ligands found in Xing: {len(ligand_genes_xing)}")

X_lig_x = adata_xing[:, ligand_genes_xing].X
if sp.issparse(X_lig_x):
    X_lig_x = X_lig_x.toarray()
df_ligands_xing = pd.DataFrame(X_lig_x, index=adata_xing.obs.index, columns=ligand_genes_xing)
df_ligands_xing["patient_x"] = adata_xing.obs["patient_x"].values
df_ligands_xing["cell_type"] = adata_xing.obs["cell_type"].values

# Tumor (malignant) ligands — source pool
tumor_ct_x     = "Malignant"
df_tumor_xing  = df_ligands_xing[df_ligands_xing["cell_type"] == tumor_ct_x].copy()
df_tumor_xing  = df_tumor_xing[ligand_genes_xing + ["patient_x"]]
print(f"Xing tumor cells: {len(df_tumor_xing)}")


# %%
# ── Build cross-celltype tiles: Tumor ligands → T-cell programs ───────────────
target_ct_tiles = "T_cell"

H_tile_df = H_xing_l2.copy()
H_tile_df["patient_x"] = adata_T_xing.obs["patient_x"].reindex(H_tile_df.index).values
H_tile_df = H_tile_df.dropna(subset=["patient_x"])
prog_cols_xing = [c for c in H_tile_df.columns if c != "patient_x"]

tiles_xing = build_cross_celltype_tiles_lung(
    df_ligands_source=df_tumor_xing,
    df_scores_target =H_tile_df,
    patient_col="patient_x",
    tile_size=TILE_SIZE_T,
    n_tiles_per_patient=N_TILES_PER_PATIENT_T,
    min_cells=MIN_CELLS_PER_TILE_T,
    agg="mean",
)

if tiles_xing is not None and not tiles_xing.empty:
    tiles_xing.attrs["ligand_cols"]  = ligand_genes_xing
    tiles_xing.attrs["program_cols"] = prog_cols_xing
    tile_data_xing = {target_ct_tiles: tiles_xing}
    tiles_path = os.path.join(OUTPUT_DIR_TILES, f"tiles_{target_ct_tiles}.parquet")
    os.makedirs(OUTPUT_DIR_TILES, exist_ok=True)
    tiles_xing.to_parquet(tiles_path)
    print(f"Tiles saved → {tiles_path}")
else:
    print("Could not generate tiles. Check min_cells/tile_size vs actual cell counts.")


# %%
# ── Run tile-level XGBoost regression ────────────────────────────────────────
print("\n=== Running tile-level XGBoost (Xing, Mynard W) ===")
results_xgb_xing = run_xgb_regression_tiles_lung(
    tile_data_xing, [target_ct_tiles]
)
plot_rmsle_bar_t(results_xgb_xing, ct=target_ct_tiles)


# %%
# ── Importance heatmaps ───────────────────────────────────────────────────────
importance_tables_xing = collect_importances_tiles(results_xgb_xing)
for ct_k, df_imp in importance_tables_xing.items():
    if df_imp.shape[0] >= 2 and df_imp.shape[1] >= 2:
        plot_importance_heatmap_tiles(df_imp, cell_type=ct_k, cluster=True)
    else:
        plot_importance_heatmap_tiles(df_imp, cell_type=ct_k, cluster=False)


# %%
# ── SHAP summaries (tile-level) → all_shap_Xing ──────────────────────────────
os.makedirs(SHAP_DIR_TILES, exist_ok=True)
all_shap_Xing, top100_xing, top100_by_prog_xing, top100_by_ct_prog_xing = \
    build_shap_summaries_tiles(
        results_xgb_t=results_xgb_xing,
        tile_data=tile_data_xing,
        top_n=100,
        make_plots=True,
        shap_dir=SHAP_DIR_TILES,
    )

# Rename T_cell → TNKILC for cross-dataset comparison
all_shap_Xing = all_shap_Xing.copy()
all_shap_Xing["ct"] = all_shap_Xing["ct"].replace({"T_cell": "TNKILC"})

all_shap_Xing.to_csv(os.path.join(OUTPUT_DIR_TILES, "all_shap_xing_tiles.csv"), index=False)
print("all_shap_Xing shape:", all_shap_Xing.shape)


# %%
# ── Load Mynard SHAP (from patient-level pipeline saved above) ─────────────
target_ct_cmp = "TNKILC"

if os.path.exists(MYNARD_SHAP_CSV):
    all_shap_Mynard = pd.read_csv(MYNARD_SHAP_CSV)
    if "cell_type" in all_shap_Mynard.columns:
        all_shap_Mynard = all_shap_Mynard.rename(columns={"cell_type": "ct"})
    # Patient-level pipeline used "T_cell"; map to TNKILC
    all_shap_Mynard["ct"] = all_shap_Mynard["ct"].replace({"T_cell": "TNKILC"})
    print("all_shap_Mynard shape:", all_shap_Mynard.shape)
    print("Mynard programs:", all_shap_Mynard["program"].unique()[:8])
else:
    print(f"WARNING: {MYNARD_SHAP_CSV} not found — run the SHAP save cell above first.")
    all_shap_Mynard = pd.DataFrame(columns=["ct", "program", "feature", "mean_abs_shap"])


# %%
# ── Cross-dataset comparison: Mynard vs Xing ─────────────────────────────────
if not all_shap_Mynard.empty and not all_shap_Xing.empty:
    visualize_separate_top_k_raw_highlight_t(all_shap_Mynard, all_shap_Xing,
                                              target_ct_cmp, top_k=30)
    visualize_shared_shap_zscore_t(all_shap_Mynard, all_shap_Xing,
                                    target_ct_cmp, top_n=10)
    save_program_comparisons_lung(all_shap_Mynard, all_shap_Xing, target_ct_cmp)
else:
    print("One or both SHAP datasets empty — skipping comparison.")


# %%
# ── Common ligands per program (mean_abs_shap > 0) ───────────────────────────
if not all_shap_Mynard.empty and not all_shap_Xing.empty:
    _m_f = all_shap_Mynard[all_shap_Mynard["mean_abs_shap"] > 0].copy()
    _x_f = all_shap_Xing  [all_shap_Xing  ["mean_abs_shap"] > 0].copy()

    progs_m = set(_m_f["program"].unique()) if "program" in _m_f.columns else set()
    progs_x = set(_x_f["program"].unique()) if "program" in _x_f.columns else set()
    common_programs_mx = progs_m & progs_x

    if common_programs_mx:
        ligand_overlap_mx = {}
        for prog in sorted(common_programs_mx):
            m_ligs = set(_m_f[_m_f["program"] == prog]["feature"].unique())
            x_ligs = set(_x_f[_x_f["program"] == prog]["feature"].unique())
            common_ligs = m_ligs & x_ligs
            ligand_overlap_mx[prog] = {
                "Mynard_only": len(m_ligs - x_ligs),
                "Xing_only":   len(x_ligs - m_ligs),
                "Common":      len(common_ligs),
                "Total_Mynard": len(m_ligs),
                "Total_Xing":  len(x_ligs),
            }

        progs  = sorted(ligand_overlap_mx.keys())
        counts = [ligand_overlap_mx[p]["Common"] for p in progs]

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))
        colors = plt.cm.viridis(np.linspace(0, 1, len(progs)))
        bars = ax1.barh(progs, counts, color=colors)
        ax1.set_xlabel("Number of Common Ligands", fontsize=12, fontweight="bold")
        ax1.set_title("Common Ligands per Program\n(Mynard vs Xing, mean_abs_shap > 0)",
                      fontsize=13, fontweight="bold")
        ax1.grid(axis="x", alpha=0.3)
        for i, (bar, cnt) in enumerate(zip(bars, counts)):
            ax1.text(cnt + 0.3, i, str(cnt), va="center", fontsize=10)

        m_only  = [ligand_overlap_mx[p]["Mynard_only"] for p in progs]
        common_ = [ligand_overlap_mx[p]["Common"]      for p in progs]
        x_only  = [ligand_overlap_mx[p]["Xing_only"]   for p in progs]
        x_pos   = np.arange(len(progs))
        ax2.barh(x_pos, m_only,  0.6, label="Mynard Only", color="#FF6B6B", alpha=0.8)
        ax2.barh(x_pos, common_, 0.6, left=m_only, label="Common", color="#4ECDC4", alpha=0.8)
        ax2.barh(x_pos, x_only,  0.6,
                 left=np.array(m_only) + np.array(common_),
                 label="Xing Only", color="#95E1D3", alpha=0.8)
        ax2.set_yticks(x_pos); ax2.set_yticklabels(progs)
        ax2.set_xlabel("Number of Ligands", fontsize=12, fontweight="bold")
        ax2.set_title("Ligand Overlap Composition per Program", fontsize=13, fontweight="bold")
        ax2.legend(loc="lower right"); ax2.grid(axis="x", alpha=0.3)
        plt.tight_layout()
        os.makedirs(PLOTS_PATH_TILES, exist_ok=True)
        plt.savefig(os.path.join(PLOTS_PATH_TILES, "common_ligands_per_program_mx.png"),
                    dpi=300, bbox_inches="tight")
        plt.show()

        summary_mx = pd.DataFrame(ligand_overlap_mx).T
        summary_mx = summary_mx[["Total_Mynard", "Total_Xing", "Mynard_only", "Common", "Xing_only"]]
        summary_mx["Overlap_%"] = (
            summary_mx["Common"] /
            summary_mx[["Total_Mynard", "Total_Xing"]].min(axis=1) * 100
        ).round(1)
        print("\n" + "=" * 100)
        print("LIGAND OVERLAP SUMMARY — Mynard vs Xing (mean_abs_shap > 0)".center(100))
        print("=" * 100)
        print(summary_mx.to_string())
        print("=" * 100)
    else:
        print("No common programs found between Mynard and Xing.")
else:
    print("One or both SHAP datasets empty.")


# %%
# ── Cross-program similarity heatmap: Mynard programs vs Xing programs ───────
if not all_shap_Mynard.empty and not all_shap_Xing.empty:
    _m_f2 = all_shap_Mynard[all_shap_Mynard["mean_abs_shap"] > 0].copy()
    _x_f2 = all_shap_Xing  [all_shap_Xing  ["mean_abs_shap"] > 0].copy()
    progs_m2 = sorted(_m_f2["program"].unique()) if "program" in _m_f2.columns else []
    progs_x2 = sorted(_x_f2["program"].unique()) if "program" in _x_f2.columns else []

    if progs_m2 and progs_x2:
        def _top_set_t(df, prog, n):
            sub = df[df["program"] == prog].drop_duplicates("feature")
            return set(sub.nlargest(n, "mean_abs_shap")["feature"])

        m_sets  = {p: set(_m_f2[_m_f2["program"] == p]["feature"].unique()) for p in progs_m2}
        x_sets  = {p: set(_x_f2[_x_f2["program"] == p]["feature"].unique()) for p in progs_x2}
        m_top5  = {p: _top_set_t(_m_f2, p,  5) for p in progs_m2}
        m_top10 = {p: _top_set_t(_m_f2, p, 10) for p in progs_m2}
        x_top5  = {p: _top_set_t(_x_f2, p,  5) for p in progs_x2}
        x_top10 = {p: _top_set_t(_x_f2, p, 10) for p in progs_x2}

        def build_matrix_t(pd1, pd2, progs_r, progs_c):
            return pd.DataFrame(
                [[len(pd1[pp] & pd2[lp]) for lp in progs_c] for pp in progs_r],
                index=progs_r, columns=progs_c
            )

        mat_all   = build_matrix_t(m_sets,  x_sets,  progs_m2, progs_x2)
        mat_top5  = build_matrix_t(m_top5,  x_top5,  progs_m2, progs_x2)
        mat_top10 = build_matrix_t(m_top10, x_top10, progs_m2, progs_x2)

        fig, axes = plt.subplots(1, 3, figsize=(32, 12))
        for ax, mat, title in zip(
            axes,
            [mat_all, mat_top5, mat_top10],
            ["All Sig. Ligands", "Top-5 Ligands", "Top-10 Ligands"]
        ):
            annot = mat.applymap(lambda x: f"{int(x)}" if x > 0 else "")
            sns.heatmap(mat, ax=ax, cmap="YlOrRd",
                        annot=annot, fmt="", annot_kws={"size": 8},
                        linewidths=0.2, linecolor="lightgrey",
                        vmin=0, vmax=mat.values.max(),
                        cbar_kws={"shrink": 0.7})
            ax.set_title(f"Intersection Count — {title}", fontsize=14, fontweight="bold", pad=15)
            ax.set_xlabel("Xing Program",   fontsize=11, fontweight="bold")
            ax.set_ylabel("Mynard Program", fontsize=11, fontweight="bold")
            ax.tick_params(axis="x", rotation=90, labelsize=9)
            ax.tick_params(axis="y", rotation=0,  labelsize=9)
            for i, pp in enumerate(mat.index):
                best_col = mat.loc[pp].idxmax()
                if mat.loc[pp, best_col] > 0:
                    j = list(mat.columns).index(best_col)
                    ax.text(j + 0.5, i + 0.5, "★", ha="center", va="center",
                            fontsize=12, color="blue", fontweight="bold")
        plt.suptitle("Cross-Program Similarity: Mynard vs Xing (Raw Shared Ligand Count)",
                     fontsize=18, fontweight="bold", y=1.02)
        plt.tight_layout()
        plt.savefig(os.path.join(PLOTS_PATH_TILES, "cross_program_heatmap_mx.png"),
                    dpi=300, bbox_inches="tight")
        plt.show()
    else:
        print("No programs found in one or both datasets.")
else:
    print("One or both SHAP datasets empty.")


# %%
print("\n=== TILE Pipeline (Mynard/Xing) complete ===")
