# 🍺 Pintwise - Pint Debt Tracker

A simple, elegant web application to track pints owed between friends. Built with Supabase (PostgreSQL) backend.

## Features

- **Track Pint Debts**: Record who owes pints to whom
- **Real-time Updates**: Changes are saved automatically to Supabase
- **Net Balance Calculator**: See consolidated debts between people
- **Search & Filter**: Find specific entries or people quickly
- **Responsive Design**: Works perfectly on mobile and desktop
- **Scrollable Lists**: Handle large numbers of entries with smooth scrolling

## Live Demo

Visit the live application: [Your GitHub Pages URL]

## Setup Instructions

### 1. Fork/Clone this Repository

```bash
git clone https://github.com/yourusername/pintwise.git
cd pintwise
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set up Supabase Database

1. Sign up for [Supabase](https://supabase.com/)
2. Create a new project
3. Go to Settings → API to get your project URL and anon key
4. In the SQL Editor, create the required table:

```sql
CREATE TABLE pint_entries (
    id BIGSERIAL PRIMARY KEY,
    debtor TEXT NOT NULL,
    creditor TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(10,2) DEFAULT 1.0,
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_paid TIMESTAMPTZ,
    status TEXT DEFAULT 'pending'
);

-- Disable Row Level Security for simplicity (or set up proper policies)
ALTER TABLE pint_entries DISABLE ROW LEVEL SECURITY;
```

### 4. Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Add new repository secrets:
   - **Name**: `SUPABASE_URL` - **Value**: Your Supabase project URL
   - **Name**: `SUPABASE_ANON_KEY` - **Value**: Your Supabase anon key

### 5. Enable GitHub Pages

1. Go to Settings → Pages
2. Set Source to "GitHub Actions"
3. The app will automatically deploy when you push to main branch

### 6. Local Development

For local development, create a `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

Then run:

```bash
npm start
```

## How to Use

### Adding Pint Entries

1. Click "Add Pint" in the navigation
2. Enter who owes the pint and who is owed
3. Optionally add a description and specify number of pints
4. Click "Add Pint Entry"

### Managing Debts

- **Pending Tab**: View all unpaid pints with options to mark as paid or delete
- **All Pints Tab**: See complete history of all transactions
- **Net Balances Tab**: View consolidated debts between people

### Search and Filter

Use the search bar to find entries by:
- Person names (debtor or creditor)
- Description text

## Database Schema

The app uses a PostgreSQL table in Supabase:

```sql
CREATE TABLE pint_entries (
    id BIGSERIAL PRIMARY KEY,
    debtor TEXT NOT NULL,
    creditor TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(10,2) DEFAULT 1.0,
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_paid TIMESTAMPTZ,
    status TEXT DEFAULT 'pending'
);
```

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: Supabase (PostgreSQL)
- **Build Tool**: Webpack
- **Deployment**: GitHub Actions + GitHub Pages
- **Styling**: Custom CSS with responsive design and scrollable lists

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## Support

If you encounter any issues:

1. Check that your Supabase URL and anon key are correct
2. Ensure the GitHub secrets are properly set
3. Verify that GitHub Pages is enabled
4. Check the browser console for error messages
5. Make sure the `pint_entries` table exists in your Supabase database
6. Verify that Row Level Security is disabled or proper policies are set

## Roadmap

- [ ] Export/import functionality
- [ ] User authentication
- [ ] Group management
- [ ] Email notifications
- [ ] Mobile app version
- [ ] Integration with payment apps

---

Made with ❤️ for tracking pint debts between friends!
