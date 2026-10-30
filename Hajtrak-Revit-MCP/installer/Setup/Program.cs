using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace Hajtrak.RevitMCP.Setup;

internal static class Program
{
    internal static readonly string InstallRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Hajtrak", "RevitMCP");
    internal static readonly string AddinRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Autodesk", "Revit", "Addins", "2026");
    internal static readonly string ConfigPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex", "config.toml");
    internal const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\HajtrakRevitMCP2026";

    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Contains("--verify-package"))
        {
            string? temp = null;
            try
            {
                temp = ExtractPayload();
                VerifyFiles(temp);
                var nodeVersion = Run(Path.Combine(temp, "Node", "node.exe"), ["--version"]).GetAwaiter().GetResult();
                var discovery = Run(Path.Combine(temp, "Node", "node.exe"), [Path.Combine(temp, "McpServer", "scripts", "verify-package.mjs")]).GetAwaiter().GetResult();
                var report = new JsonObject { ["ok"] = true, ["nodeVersion"] = nodeVersion.Trim(), ["discovery"] = discovery.Trim() };
                var index = Array.IndexOf(args, "--report");
                if (index >= 0 && index + 1 < args.Length) File.WriteAllText(args[index + 1], report.ToJsonString());
                Environment.ExitCode = 0;
            }
            catch (Exception ex)
            {
                var index = Array.IndexOf(args, "--report");
                if (index >= 0 && index + 1 < args.Length) File.WriteAllText(args[index + 1], new JsonObject { ["ok"] = false, ["error"] = ex.Message }.ToJsonString());
                Environment.ExitCode = 1;
            }
            finally { if (temp is not null) CleanTemp(temp); }
            return;
        }
        var uninstall = args.Contains("--uninstall");
        // Run uninstall from a temporary copy so the installed uninstaller can be removed.
        if (uninstall && !args.Contains("--temporary"))
        {
            var copy = Path.Combine(Path.GetTempPath(), "Hajtrak-RevitMCP-Uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(Environment.ProcessPath!, copy);
            Process.Start(new ProcessStartInfo(copy) { UseShellExecute = false, ArgumentList = { "--uninstall", "--temporary" } });
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new SetupWindow(uninstall));
    }

    internal static string ExtractPayload()
    {
        var root = Path.Combine(Path.GetTempPath(), "Hajtrak-RevitMCP-Setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Hajtrak.RevitMCP.Payload.zip")
            ?? throw new InvalidOperationException("The installer payload is missing. Download the setup executable from the published release.");
        using var archive = new ZipArchive(resource, ZipArchiveMode.Read);
        foreach (var entry in archive.Entries)
        {
            var name = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
            var target = Path.GetFullPath(Path.Combine(root, name));
            if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Invalid path in installer payload.");
            if (entry.FullName.EndsWith('/')) { Directory.CreateDirectory(target); continue; }
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            using var input = entry.Open();
            using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write);
            input.CopyTo(output);
        }
        return root;
    }

    internal static void VerifyFiles(string root)
    {
        var data = JsonNode.Parse(File.ReadAllText(Path.Combine(root, "payload-manifest.json")))!.AsObject();
        if (data["product"]?.GetValue<string>() != "Hajtrak Revit MCP" || data["revit"]?.GetValue<string>() != "2026")
            throw new InvalidOperationException("Wrong product payload.");
        foreach (var node in data["files"]!.AsArray())
        {
            var path = Path.GetFullPath(Path.Combine(root, node!["path"]!.GetValue<string>()));
            if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Payload path escapes root.");
            using var file = File.OpenRead(path);
            var sha = Convert.ToHexString(SHA256.HashData(file));
            if (!sha.Equals(node["sha256"]!.GetValue<string>(), StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Installer file verification failed.");
        }
    }

    internal static async Task<string> Run(string executable, IEnumerable<string> arguments)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start setup helper.");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        var text = await stdout;
        var error = await stderr;
        if (process.ExitCode != 0) throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? "Setup helper failed." : error.Trim());
        return text;
    }

    internal static void CleanTemp(string root)
    {
        var full = Path.GetFullPath(root);
        var temp = Path.GetFullPath(Path.GetTempPath());
        if (full.StartsWith(temp, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(full).StartsWith("Hajtrak-RevitMCP-Setup-", StringComparison.Ordinal))
        { try { Directory.Delete(full, true); } catch { /* A locked temporary file can be cleaned by Windows later. */ } }
    }

    internal static void RegisterUninstall()
    {
        var destination = Path.Combine(InstallRoot, "Uninstall.exe");
        File.Copy(Environment.ProcessPath!, destination, true);
        using var key = Registry.CurrentUser.CreateSubKey(UninstallKey);
        key.SetValue("DisplayName", "Hajtrak Revit MCP — Revit 2026 (Development Preview)");
        key.SetValue("DisplayVersion", "0.9.0");
        key.SetValue("Publisher", "Hajtrak");
        key.SetValue("InstallLocation", InstallRoot);
        key.SetValue("UninstallString", "\"" + destination + "\" --uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        key.SetValue("URLInfoAbout", "https://github.com/Hajtrak/Tools/tree/main/Hajtrak-Revit-MCP");
    }
}

internal sealed class SetupWindow : Form
{
    private readonly bool _uninstall;
    private readonly Button _action = new() { AutoSize = true, Text = "Install", Padding = new Padding(18, 7, 18, 7) };
    private readonly CheckBox _configure = new() { AutoSize = true, Checked = true, Text = "Configure Codex for this Windows user" };
    private readonly TextBox _revitPath = new() { Width = 560 };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill };
    private bool _busy;

    public SetupWindow(bool uninstall)
    {
        _uninstall = uninstall;
        Text = "Hajtrak Revit MCP Setup";
        ClientSize = new Size(780, 490);
        MinimumSize = new Size(760, 500);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 7 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(new Label { Text = "Hajtrak Revit MCP", AutoSize = true, Font = new Font("Segoe UI", 19, FontStyle.Bold) });
        layout.Controls.Add(new Label { Text = "Revit 2026 · Windows x64 · Development preview\nClose Revit before continuing. Node and bridge dependencies are included; no previous MCP is required.",
            AutoSize = true, MaximumSize = new Size(715, 0), Margin = new Padding(0, 8, 0, 14) });
        var folder = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        folder.Controls.Add(new Label { Text = "Revit 2026 folder", AutoSize = true, Width = 150, Margin = new Padding(0, 7, 5, 0) });
        _revitPath.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Autodesk", "Revit 2026");
        folder.Controls.Add(_revitPath);
        var browse = new Button { Text = "Browse…", AutoSize = true };
        browse.Click += (_, _) => { using var picker = new FolderBrowserDialog(); if (picker.ShowDialog(this) == DialogResult.OK) _revitPath.Text = picker.SelectedPath; };
        folder.Controls.Add(browse);
        layout.Controls.Add(folder);
        layout.Controls.Add(_configure);
        layout.Controls.Add(_log);
        var license = new LinkLabel { Text = "MIT licence · Based on KenLP/RevitMCPServer · Original copyright Le Phu", AutoSize = true, Margin = new Padding(0, 10, 0, 10) };
        license.LinkClicked += (_, _) => Process.Start(new ProcessStartInfo("https://github.com/Hajtrak/Tools/blob/main/Hajtrak-Revit-MCP/THIRD_PARTY_NOTICES.md") { UseShellExecute = true });
        layout.Controls.Add(license);
        _action.Click += async (_, _) => await Apply();
        layout.Controls.Add(_action);
        Controls.Add(layout);
        if (uninstall) { _action.Text = "Uninstall"; folder.Visible = false; _configure.Visible = false; }
        _log.Text = uninstall
            ? "This removes the managed integration and restores previous add-in/connector settings where available. Backups and operation journals are retained."
            : "Installs for the current Windows user. Existing connector settings are preserved for rollback. Revit and Codex are separate applications and are not installed by this setup.";
        FormClosing += (_, e) => { if (_busy) e.Cancel = true; };
    }

    private async Task Apply()
    {
        if (_action.Text == "Close") { Close(); return; }
        if (Process.GetProcessesByName("Revit").Length > 0) { MessageBox.Show(this, "Please close Revit before continuing.", Text); return; }
        if (!_uninstall && !File.Exists(Path.Combine(_revitPath.Text, "Revit.exe"))) { MessageBox.Show(this, "Choose the folder containing Revit 2026's Revit.exe.", Text); return; }
        if (!_uninstall && FileVersionInfo.GetVersionInfo(Path.Combine(_revitPath.Text, "Revit.exe")).FileMajorPart != 26)
        { MessageBox.Show(this, "This package requires Revit 2026. Choose its installation folder.", Text); return; }
        _busy = true; _action.Enabled = false;
        string? temp = null;
        try
        {
            string package;
            if (_uninstall)
            {
                var state = JsonNode.Parse(File.ReadAllText(Path.Combine(Program.InstallRoot, "installation-state.json")))!;
                package = state["versionDir"]!.GetValue<string>();
            }
            else { _log.AppendText("\r\nExtracting and verifying bundled files…"); package = temp = await Task.Run(Program.ExtractPayload); await Task.Run(() => Program.VerifyFiles(package)); }
            var args = new List<string> { Path.Combine(package, "installer", "engine", "install.mjs"), _uninstall ? "uninstall" : "install",
                "--install-dir", Program.InstallRoot, "--addin-dir", Program.AddinRoot, "--config", Program.ConfigPath };
            if (!_uninstall) args.AddRange(["--package", package, "--configure-codex", _configure.Checked ? "true" : "false"]);
            var result = JsonNode.Parse(await Program.Run(Path.Combine(package, "Node", "node.exe"), args))!.AsObject();
            if (_uninstall)
            {
                var cleanup = Path.GetFullPath(result["cleanupVersionDir"]!.GetValue<string>());
                var versions = Path.Combine(Program.InstallRoot, "versions") + Path.DirectorySeparatorChar;
                if (!cleanup.StartsWith(versions, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Unsafe uninstall path.");
                // Delete only unchanged files recorded in this payload; preserve added or edited files.
                Program.VerifyFiles(cleanup);
                var manifest = JsonNode.Parse(File.ReadAllText(Path.Combine(cleanup, "payload-manifest.json")))!;
                foreach (var item in manifest["files"]!.AsArray())
                    File.Delete(Path.Combine(cleanup, item!["path"]!.GetValue<string>()));
                File.Delete(Path.Combine(cleanup, "payload-manifest.json"));
                foreach (var directory in Directory.GetDirectories(cleanup, "*", SearchOption.AllDirectories).OrderByDescending(p => p.Length))
                    if (!Directory.EnumerateFileSystemEntries(directory).Any()) Directory.Delete(directory);
                if (!Directory.EnumerateFileSystemEntries(cleanup).Any()) Directory.Delete(cleanup);
                File.Delete(Path.Combine(Program.InstallRoot, "Uninstall.exe"));
                Registry.CurrentUser.DeleteSubKeyTree(Program.UninstallKey, false);
            }
            else Program.RegisterUninstall();
            _log.AppendText("\r\n\r\n" + result["message"]!.GetValue<string>());
            _action.Text = "Close";
        }
        catch (Exception ex) { _log.AppendText("\r\n\r\nCould not complete setup: " + ex.Message + "\r\nNo unrelated settings should be changed. Keep the local backups for recovery."); }
        finally { if (temp is not null) Program.CleanTemp(temp); _busy = false; _action.Enabled = true; }
    }
}

