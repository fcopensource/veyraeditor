# Publishing our Python libraries to PyPI

How `dxray` and `veyra-snap` (in `python/`) get to `pip install`. Read it once top to bottom; after that, a release is
the five steps in [Every release](#every-release).

## How it fits together

- **PyPI** (pypi.org) is where `pip install` downloads packages from. Anyone can publish; a name belongs to whoever
  publishes it first.
- **A release** is a version number (like `1.0.0`) plus two files built from the code: a **wheel** (`.whl`, ready to
  install) and an **sdist** (`.tar.gz`, the source). `pyproject.toml` describes the package: name, description,
  dependencies, the README that becomes the PyPI page.
- **A version can be uploaded only once, ever.** If `1.0.0` has a mistake, you publish `1.0.1`. You can't replace or
  re-upload a version, even after deleting it.
- **Trusted Publishing** lets GitHub Actions upload to PyPI without a password or token stored anywhere: PyPI trusts a
  specific workflow in a specific repository. That's how ours are set up.

Each library has its own workflow that tests it on every pull request and publishes when you ask:

| Library | Folder | Workflow | PyPI page |
|---|---|---|---|
| dxray | `python/dxray` | `.github/workflows/dxray.yml` | https://pypi.org/project/dxray/ |
| veyra-snap | `python/veyra-snap` | `.github/workflows/veyra-snap.yml` | https://pypi.org/project/veyra-snap/ |

## One-time setup (about 10 minutes)

### 1. A PyPI account

1. Sign up at https://pypi.org/account/register/ and confirm the email.
2. Turn on **two-factor authentication** (Account settings → Add 2FA). PyPI requires it to publish.
3. Optional, for trial runs: do the same at https://test.pypi.org (a separate practice site with separate accounts).

### 2. Tell PyPI to trust our workflow (a "pending publisher")

The project doesn't exist on PyPI yet, so you reserve it for our workflow:

1. Go to https://pypi.org/manage/account/publishing/ → **Add a new pending publisher** → **GitHub**.
2. Fill it in **exactly** (one entry per library):

   | Field | dxray | veyra-snap |
   |---|---|---|
   | PyPI Project Name | `dxray` | `veyra-snap` |
   | Owner | `fcopensource` | `fcopensource` |
   | Repository name | `veyraeditor` | `veyraeditor` |
   | Workflow name | `dxray.yml` | `veyra-snap.yml` |
   | Environment name | `pypi` | `pypi` |

3. Click **Add**. The first successful publish turns it into a normal project you own.

For trial runs on TestPyPI, add the same entries at https://test.pypi.org/manage/account/publishing/ with environment
name `testpypi`.

### 3. Optional: a safety catch in GitHub

In the repository: **Settings → Environments → New environment** named `pypi`, then tick **Required reviewers** and
add yourself. A publish then waits until you click **Approve**, so nobody publishes by accident.

## Every release

1. **Merge the code.** The library's pull request must be merged into `main`, with its tests green.
2. **Optional practice run:** Actions → **dxray (Python)** (or **veyra-snap (Python)**) → **Run workflow** →
   branch `main`, publish: **testpypi**. Then try it:

   ```console
   pip install -i https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ dxray
   ```

3. **Publish:** Actions → the same workflow → **Run workflow** → publish: **pypi**.
   The run tests the library, builds the wheel and sdist, checks them with `twine check`, and uploads.
4. **Check it:** open https://pypi.org/project/dxray/ and, in a fresh terminal:

   ```console
   pip install dxray
   dxray --version
   ```

5. **Tell people:** the website pages switch to `pip install …` by themselves within the hour.

## Releasing a new version

1. On a new branch, change the code and add tests.
2. Bump the version in the library's `src/<package>/__init__.py` (`__version__ = "1.0.1"`). Use
   [semantic versioning](https://semver.org): `1.0.1` for fixes, `1.1.0` for new features, `2.0.0` when existing code
   using the library would break.
3. Add a section at the top of its `CHANGELOG.md`.
4. Pull request → merge → [Every release](#every-release) from step 2.

## When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `invalid-publisher` in the upload step | The pending publisher doesn't match the run | Compare every field in step 2 above with the workflow file name and environment, letter by letter |
| `File already exists` | That version is already on PyPI | Bump the version; versions can't be re-uploaded |
| `The name 'x' is too similar to an existing project` | PyPI blocks look-alike names (`data-xray` blocks `dataxray`) | Choose another name in `pyproject.toml` |
| The run waits forever | The `pypi` environment needs your approval | Open the run and click **Review deployments → Approve** |
| `twine check` fails | The README can't be shown on PyPI | Fix the Markdown it names |
| A broken release is out | Users installing it get the bug | Publish a fixed version; on PyPI you can also **yank** the bad one (Manage → Releases), which hides it from new installs without breaking anyone pinned to it |

## Doing it by hand (to understand it, or without GitHub)

The workflow does exactly this:

```console
cd python/dxray
python -m pip install build twine
python -m build                     # makes dist/dxray-1.0.0-py3-none-any.whl and dist/dxray-1.0.0.tar.gz
python -m twine check dist/*        # will PyPI accept it and show the README?
python -m twine upload dist/*       # asks for an API token from https://pypi.org/manage/account/token/
```

Use a token (username `__token__`, the token as the password), never your PyPI password, and prefer the workflow so
no token has to live on anyone's machine.
