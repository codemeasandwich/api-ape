#!/usr/bin/env node
/**
 * Simple VSIX packager that doesn't require vsce
 * A .vsix is just a zip file with a specific structure
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const extDir = path.resolve(__dirname, '..');
const pkg = require(path.join(extDir, 'package.json'));

// Create temp directory for packaging
const tempDir = path.join(extDir, '.vsix-temp');
const extensionDir = path.join(tempDir, 'extension');

// Clean up any previous temp dir
if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
}
fs.mkdirSync(extensionDir, { recursive: true });

// Files to include
const filesToCopy = [
    'package.json',
    'src',
    'README.md',
];

// Copy files
for (const file of filesToCopy) {
    const src = path.join(extDir, file);
    const dest = path.join(extensionDir, file);
    if (fs.existsSync(src)) {
        if (fs.statSync(src).isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
        } else {
            fs.copyFileSync(src, dest);
        }
    }
}

// Copy icon if exists
if (fs.existsSync(path.join(extDir, 'extension.png'))) {
    fs.copyFileSync(path.join(extDir, 'extension.png'), path.join(extensionDir, 'extension.png'));
}

// Create [Content_Types].xml
const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension=".json" ContentType="application/json"/>
    <Default Extension=".js" ContentType="application/javascript"/>
    <Default Extension=".js.map" ContentType="application/json"/>
    <Default Extension=".png" ContentType="image/png"/>
    <Default Extension=".md" ContentType="text/markdown"/>
    <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>`;
fs.writeFileSync(path.join(tempDir, '[Content_Types].xml'), contentTypes);

// Check if icon exists
const hasIcon = fs.existsSync(path.join(extDir, 'extension.png'));

// Create extension.vsixmanifest
const vsixManifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
    <Metadata>
        <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/>
        <DisplayName>${pkg.displayName}</DisplayName>
        <Description>${pkg.description}</Description>
        <Tags>${(pkg.keywords || []).join(',')}</Tags>
        <Categories>${(pkg.categories || ['Other']).join(',')}</Categories>
        <GalleryFlags>Public</GalleryFlags>
        <Properties>
            <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}"/>
            <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
            <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
            <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui,workspace"/>
            <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/>
            <Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true"/>
        </Properties>${hasIcon ? `
        <Icon>extension/extension.png</Icon>` : ''}
    </Metadata>
    <Installation>
        <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
    </Installation>
    <Dependencies/>
    <Assets>
        <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>${hasIcon ? `
        <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/extension.png" Addressable="true"/>` : ''}
    </Assets>
</PackageManifest>`;
fs.writeFileSync(path.join(tempDir, 'extension.vsixmanifest'), vsixManifest);

// Create the vsix (zip)
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(extDir, vsixName);

// Remove old vsix if exists
if (fs.existsSync(vsixPath)) {
    fs.unlinkSync(vsixPath);
}

// Use zip command to create vsix
process.chdir(tempDir);
execSync(`zip -r "${vsixPath}" . -x "*.DS_Store"`, { stdio: 'inherit' });

// Clean up temp dir
fs.rmSync(tempDir, { recursive: true });

console.log(`\nCreated: ${vsixName}`);
