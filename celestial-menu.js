// Celestial Menu - Completely separate from orb functionality
document.addEventListener('DOMContentLoaded', () => {
    // Wait for everything to load
    setTimeout(() => {
        const meteorIcon = document.getElementById('meteorIcon');
        const dropdownContent = document.getElementById('dropdownContent');
        const celestialMenu = document.getElementById('celestialMenu');
        const aboutSection = document.getElementById('aboutSection');
        const supportSection = document.getElementById('supportSection');
        
        if (!meteorIcon || !dropdownContent || !celestialMenu) return;
        
        let isDropdownOpen = false;
        
        // Toggle dropdown
        meteorIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDropdownOpen = !isDropdownOpen;
            dropdownContent.classList.toggle('show', isDropdownOpen);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!celestialMenu.contains(e.target)) {
                isDropdownOpen = false;
                dropdownContent.classList.remove('show');
            }
        });
        
        // Close sections when clicking outside
        document.addEventListener('click', (e) => {
            if (!aboutSection.contains(e.target) && !supportSection.contains(e.target)) {
                if (aboutSection) aboutSection.classList.add('hidden');
                if (supportSection) supportSection.classList.add('hidden');
            }
        });
        
        // Handle menu item clicks
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const section = item.dataset.section;
                
                // Hide all sections first
                if (aboutSection) aboutSection.classList.add('hidden');
                if (supportSection) supportSection.classList.add('hidden');
                
                // Show selected section
                if (section === 'about' && aboutSection) {
                    aboutSection.classList.remove('hidden');
                } else if (section === 'support' && supportSection) {
                    supportSection.classList.remove('hidden');
                }
                
                // Close dropdown
                isDropdownOpen = false;
                dropdownContent.classList.remove('show');
            });
        });
    }, 200);
});