# Tools

Offline tools for IFC models and material lists.

## IFC Material List

[IFC_MaterialList](IFC_MaterialList/) contains a self-contained, offline HTML tool that extracts IFC member properties into a grouped material-list CSV. Open `IFC_MaterialList/IFC_Material_List_Tool.html` in Edge or Chrome; no installation or internet connection is needed.

- [Usage and limitations](IFC_MaterialList/README.md)
- [Changelog](IFC_MaterialList/CHANGELOG.md)
- [Review and validation](IFC_MaterialList/REVIEW.md)

## IFC Viewer

[Download IFC Viewer 1.3.2 — installer or portable ZIP](https://github.com/Hajtrak/Tools/releases/tag/ifc-viewer-v1.3.2). Choose Setup.exe for installation or Windows-x64.zip for portable use. GitHub source ZIPs are for developers.

[IFC_Viewer](IFC_Viewer/) contains a portable Windows desktop IFC viewer with 3D navigation, member properties, configurable material lists, TXT/CSV exports, colours and visibility controls.

- [Overview, building and testing](IFC_Viewer/README.md)
- [User guide](IFC_Viewer/docs/USER_GUIDE.md)
- [Verification and limitations](IFC_Viewer/docs/VERIFICATION.md)
- [Changelog](IFC_Viewer/CHANGELOG.md)

## Licence

[MIT](LICENSE). Bundled third-party components retain their own licences.

## Repository contents

Source, tests, build scripts, documentation and licences are kept in Git. Installers and portable builds belong in Releases. Generated files, dependencies, caches, private IFCs and local test results are excluded. The browser material-list tool and desktop viewer are separate tools and both are retained.
