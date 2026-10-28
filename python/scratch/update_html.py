import re

with open(r'd:\PRJ\Robstride\templates\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove Sizing Status Badges
content = re.sub(
    r'<!-- Sizing Status Badge -->.*?</div>\s*</div>',
    '</div>',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'<!-- Sizing Status Badge J2 -->.*?</div>\s*</div>',
    '</div>',
    content,
    flags=re.DOTALL
)

# Also remove the JS part that updates it
content = re.sub(
    r'// 100 Nm Physical Safety Warning.*?updateSizingBadge\(\'j2\', j2Peak, \'Harmonic Drive CSG-20 \(1:80\) OK\'\);',
    '',
    content,
    flags=re.DOTALL
)

# 2. Reduce font sizes in SVG
svg_match = re.search(r'<svg\s+class="w-full h-full max-h-\[560px\] drop-shadow-2xl"\s+id="arm_canvas"\s+viewBox="0 0 800 520">.*?</svg>', content, re.DOTALL)
if svg_match:
    svg_block = svg_match.group(0)
    svg_block = re.sub(r'font-size="10"', 'font-size="7"', svg_block)
    svg_block = re.sub(r'font-size="11"', 'font-size="8"', svg_block)
    svg_block = re.sub(r'font-size="12"', 'font-size="8"', svg_block)
    svg_block = re.sub(r'font-size="9"', 'font-size="7"', svg_block)
    
    content = content[:svg_match.start()] + svg_block + content[svg_match.end():]
else:
    print("WARNING: SVG block not found!")

# 3. Add zooming script
zoom_script = """
    // Zooming for SVG Canvas
    const svgCanvas = document.getElementById('arm_canvas');
    let viewBox = {x: 0, y: 0, w: 800, h: 520};
    
    if (svgCanvas) {
      svgCanvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        
        const rect = svgCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const svgMouseX = viewBox.x + (mouseX / rect.width) * viewBox.w;
        const svgMouseY = viewBox.y + (mouseY / rect.height) * viewBox.h;

        viewBox.w /= zoom;
        viewBox.h /= zoom;

        viewBox.x = svgMouseX - (mouseX / rect.width) * viewBox.w;
        viewBox.y = svgMouseY - (mouseY / rect.height) * viewBox.h;

        svgCanvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
      }, { passive: false });
    }
"""
content = content.replace('// Elements', zoom_script + '\n    // Elements')

with open(r'd:\PRJ\Robstride\templates\index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
