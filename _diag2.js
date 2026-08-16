// Full diagnostic: extract and validate everything around heatmap
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// 1. Check if heatGrid div exists in HTML
const hgMatch = html.match(/id="heatGrid"/g);
console.log('1. id="heatGrid" count:', hgMatch ? hgMatch.length : 0);

// 2. Check heat-grid class usage
const hgcMatch = html.match(/class="heat-grid"/g);
console.log('2. class="heat-grid" count:', hgcMatch ? hgcMatch.length : 0);

// 3. Check hl-cell template in buildHeat
const cellTemplate = html.match(/data-iso="\$\{x\.iso\}"/);
console.log('3. cell template exists:', !!cellTemplate);

// 4. Check DAILY array construction
const weeksMatch = html.match(/const WEEKS=\[/);
console.log('4. WEEKS array defined:', !!weeksMatch);

const dailyMatch = html.match(/const DAILY=buildDaily\(\)/);
console.log('5. DAILY assignment:', !!dailyMatch);

// 6. Check buildHeat call
const bhCall = html.match(/buildHeat\(\)/g);
console.log('6. buildHeat() calls:', bhCall ? bhCall.length : 0);

// 7. Check refreshHeat call  
const rhCall = html.match(/refreshHeat\(\)/g);
console.log('7. refreshHeat() calls:', rhCall ? rhCall.length : 0);

// 8. Verify heat-wrap structure is intact (open/close)
const hwOpen = (html.match(/class="heat-wrap"/g) || []).length;
console.log('8. heat-wrap count:', hwOpen);

// 9. Check for any [hidden] attribute on heat-related elements
const hiddenHeat = html.match(/heat.*hidden|hidden.*heat/);
console.log('9. hidden on heat elements:', !!hiddenHeat);

// 10. Extract the full buildHeat function and check its syntax
const bhFuncMatch = html.match(/function buildHeat\(\)[\s\S]*?^}/m);
if (bhFuncMatch) {
  try {
    new Function(bhFuncMatch[0]);
    console.log('10. buildHeat() syntax: OK');
  } catch(e) {
    console.log('10. buildHeat() syntax ERROR:', e.message);
  }
}

// 11. Check if there's ANY style rule that could hide .heat-grid or .hl-cell
// Look for display:none near heat-grid
const cssSection = html.match(/<style>([\s\S]*?)<\/style>/);
if (cssSection) {
  const css = cssSection[1];
  const hidingRules = css.match(/[.{](heat-grid|hl-cell|heat-scroll|heat-wrap)[^}]*display\s*:\s*none/g);
  console.log('11. Hiding rules for heat elements:', hidingRules || 'none');
  
  // Check for visibility:hidden or opacity:0
  const invisRules = css.match(/[.{](heat-grid|hl-cell|heat-scroll|heat-wrap)[^}]*(visibility\s*:\s*hidden|opacity\s*:\s*0)/g);
  console.log('12. Invisibility rules:', invisRules || 'none');
}

// 13. CRITICAL: Check if the </script> tag appears mid-file (would split the script)
const scriptTags = html.match(/<script>|<\/script>/g);
console.log('13. Script tags:', scriptTags ? scriptTags.join(', ') : 'none');

// 14. Count total script blocks
const scriptBlocks = html.match(/<script[\s>]/g);
console.log('14. Total <script> openings:', scriptBlocks ? scriptBlocks.length : 0);

// 15. Check for syntax errors in the ENTIRE script block
const allScript = html.match(/<script>([\s\S]*?)<\/script>/g);
if (allScript) {
  allScript.forEach((block, i) => {
    const code = block.replace(/<\/?script>/g, '');
    try {
      new Function(code);
      console.log(`15. Script block ${i+1} syntax: OK (${code.length} chars)`);
    } catch(e) {
      console.log(`15. Script block ${i+1} syntax ERROR:`, e.message);
      // Show where error is
      const lines = code.split('\n');
      const errLine = e.message.match(/line (\d+)/);
      if (errLine) {
        const n = parseInt(errLine[1]);
        console.log('   Context:', lines[Math.max(0,n-3)].slice(0,80));
        console.log('   Context:', lines[Math.max(0,n-2)].slice(0,80));
        console.log('   ERROR ->', lines[Math.max(0,n-1)].slice(0,120));
        console.log('   Context:', lines[n].slice(0,80));
      }
    }
  });
}
