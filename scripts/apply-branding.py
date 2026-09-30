"""Apply the family branding to the web client.

Re-run after changing APP_NAME or the images in src/assets/img/branding (rendered by
finly/branding/render.py in the server repo). Only English strings are renamed.
"""
import os
import re

APP_NAME = 'Finly'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, fn):
    path = os.path.join(ROOT, rel)
    with open(path, encoding='utf-8', newline='') as f:
        before = f.read()
    after = fn(before)
    if after != before:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(after)
        print('updated', rel)


ux = '@jellyfin/ux-web/'
brand = 'assets/img/branding/'

# Logos in code and styles
for rel in ['src/apps/modern/components/drawers/DrawerHeaderLink.tsx', 'src/components/toolbar/ServerButton.tsx',
            'src/plugins/logoScreensaver/plugin.js', 'src/styles/site.scss', 'src/themes/_base/_theme.scss']:
    edit(rel, lambda s: s.replace(ux + 'icon-transparent.png', brand + 'icon-transparent.png')
         .replace(ux + 'banner-light.png', brand + 'banner-light.png')
         .replace(ux + 'banner-dark.png', brand + 'banner-dark.png'))

# Fallback names shown before the server name loads
for rel in ['src/apps/modern/components/drawers/DrawerHeaderLink.tsx', 'src/components/toolbar/ServerButton.tsx']:
    edit(rel, lambda s: s.replace("|| 'Jellyfin'", "|| '" + APP_NAME + "'"))
edit('src/scripts/libraryMenu.js', lambda s: s.replace("let documentTitle = 'Jellyfin';", "let documentTitle = '" + APP_NAME + "';"))

# Page title, favicons and install manifest
edit('src/index.html', lambda s: s.replace('content="Jellyfin"', 'content="' + APP_NAME + '"')
     .replace('<title>Jellyfin</title>', '<title>' + APP_NAME + '</title>')
     .replace('../node_modules/@jellyfin/ux-web/favicons/', './' + brand + 'favicons/'))
edit('webpack.common.js', lambda s: s.replace("path.resolve(__dirname, 'node_modules/@jellyfin/ux-web/favicons')",
                                              "path.resolve(__dirname, 'src/" + brand + "favicons')"))
edit('src/manifest.json', lambda s: s.replace('"name": "Jellyfin"', '"name": "' + APP_NAME + '"')
     .replace('"short_name": "Jellyfin"', '"short_name": "' + APP_NAME + '"'))

WORD = re.compile(r'\bJellyfin\b')
ENTRY = re.compile(r'^(\s*"[^"]+"\s*:\s*)"((?:[^"\\]|\\.)*)"', re.M)


def rename_strings(text):
    """Rename the product inside values only, keeping the file's formatting, keys and links."""
    def value(match):
        v = match.group(2)
        if 'jellyfin.org' not in v:
            v = WORD.sub(APP_NAME, v)
        return match.group(1) + '"' + v + '"'
    return ENTRY.sub(value, text)


for rel in ['src/strings/en-us.json', 'src/strings/en-gb.json']:
    edit(rel, rename_strings)
