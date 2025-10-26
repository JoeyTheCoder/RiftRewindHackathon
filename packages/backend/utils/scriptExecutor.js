const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Execute the fetch_lol_data.sh script
 * 
 * @param {Object} params - Script parameters
 * @param {string} params.gameName - Riot ID game name
 * @param {string} params.tagLine - Riot ID tag line
 * @param {string} params.region - Region (e.g., 'EUW', 'NA', 'KR')
 * @param {number} params.count - Number of matches to fetch (default: 50, max: 100)
 * @param {string} params.outdir - Output directory
 * @returns {Promise<Object>} - Execution result with file paths
 */
async function executeRiotScript(params) {
  const { gameName, tagLine, region, count = 50, outdir } = params;

  // Validate inputs
  if (!gameName || !tagLine || !region) {
    throw new Error('Missing required parameters: gameName, tagLine, region');
  }

  // Cap count at 100
  const matchCount = Math.min(Math.max(count, 1), 100);

  const scriptPath = path.join(__dirname, '..', 'scripts', 'fetch_lol_data.sh');
  
  // Build script arguments
  const args = [
    '--name', gameName,
    '--tag', tagLine,
    '--region', region,
    '--count', matchCount.toString(),
    '--type', 'ranked', // Only fetch ranked matches
    '--include-summoner', // Include summoner data
    '--outdir', outdir
  ];

  return new Promise((resolve, reject) => {
    console.log(`🔄 Executing script: ${scriptPath}`);
    console.log(`   Arguments: ${args.join(' ')}`);

    // Use WSL bash on Windows
    const isWindows = process.platform === 'win32';
    let command, commandArgs;

    if (isWindows) {
      // Execute via WSL - read script content and pipe to bash
      command = 'wsl';
      
      // Convert output directory to WSL path
      const wslOutdir = outdir.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, drive) => 
        `/mnt/${drive.toLowerCase()}`
      );
      
      // Build the command: RIOT_API_KEY=xxx bash -s -- <args>
      // Set env var inline (works on all WSL versions)
      commandArgs = [
        'RIOT_API_KEY=' + process.env.RIOT_API_KEY,
        'bash',
        '-s',
        '--',
        '--name', gameName,
        '--tag', tagLine,
        '--region', region,
        '--count', matchCount.toString(),
        '--type', 'ranked',
        '--include-summoner',
        '--outdir', wslOutdir
      ];
      
      // We'll pipe the script content via stdin
    } else {
      // Unix-like systems (Linux, macOS)
      command = 'bash';
      commandArgs = [scriptPath, ...args];
    }

    const child = spawn(command, commandArgs, {
      env: {
        ...process.env,
        RIOT_API_KEY: process.env.RIOT_API_KEY
      }
    });

    // For Windows/WSL, pipe the script content to stdin
    if (isWindows) {
      const scriptContent = require('fs').readFileSync(scriptPath, 'utf8');
      child.stdin.write(scriptContent);
      child.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      console.log(`   ${text.trim()}`);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      console.error(`   ⚠️  ${text.trim()}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Script executed successfully');
        
        // Parse output to extract file paths
        const result = {
          success: true,
          stdout,
          stderr,
          // These will be populated by parsing the output or directory structure
          files: {
            outdir: outdir
          }
        };
        
        resolve(result);
      } else {
        console.error(`❌ Script failed with exit code ${code}`);
        reject(new Error(`Script execution failed with code ${code}\n${stderr}`));
      }
    });

    child.on('error', (error) => {
      console.error('❌ Failed to execute script:', error.message);
      reject(new Error(`Failed to spawn process: ${error.message}`));
    });
  });
}

/**
 * Find the most recent files in a directory matching a pattern
 * 
 * @param {string} directory - Directory to search
 * @param {string} pattern - File pattern to match
 * @returns {Promise<string|null>} - Path to most recent file or null
 */
async function findMostRecentFile(directory, pattern) {
  try {
    const files = await fs.readdir(directory);
    const matchingFiles = files.filter(f => f.includes(pattern));
    
    if (matchingFiles.length === 0) {
      return null;
    }

    // Sort by modification time (most recent first)
    const filesWithStats = await Promise.all(
      matchingFiles.map(async (file) => {
        const fullPath = path.join(directory, file);
        const stats = await fs.stat(fullPath);
        return { path: fullPath, mtime: stats.mtime };
      })
    );

    filesWithStats.sort((a, b) => b.mtime - a.mtime);
    
    return filesWithStats[0].path;
  } catch (error) {
    console.error(`Error finding files in ${directory}:`, error.message);
    return null;
  }
}

module.exports = {
  executeRiotScript,
  findMostRecentFile
};

