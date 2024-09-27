import type { MetaFunction } from "@remix-run/node";
import { useEffect, useState } from "react";
import { Octokit } from "octokit";

export const meta: MetaFunction = () => {
  return [
    { title: "GitHub Unwrapped" },
    { name: "description", content: "See your GitHub stats over the past year!" },
  ];
};

interface Stats {
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  commitsByRepo: Record<string, number>;
  prsByRepo: Record<string, number>;
  issuesByRepo: Record<string, number>;
  commentsOnPRs: number;
  topReviewers: Record<string, number>;
  mostReviewedRepos: Record<string, number>;
  topLanguages: Record<string, number>;
  monthlyContributions: Record<string, number>;
  prMergeTimes: number[];
  issueResolutionTimes: number[];
  mostActiveDay: string;
  topReposByCommits: Record<string, number>;
  topReposByIssues: Record<string, number>;
}

export default function Index() {
  const [showStats, setShowStats] = useState(false);
  const [githubHandle, setGithubHandle] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const createSnowFlake = () => {
      const snow_flake = document.createElement("div");
      snow_flake.className = "snow-flake absolute top-0 w-2 h-2 bg-white rounded-full opacity-80 animate-fall";
      snow_flake.style.left = `${Math.random() * window.innerWidth}px`;
      snow_flake.style.animationDuration = `${Math.random() * 3 + 2}s`;
      document.body.appendChild(snow_flake);

      setTimeout(() => {
        snow_flake.remove();
      }, 5000);
    };

    const interval = setInterval(createSnowFlake, 100);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async (username: string) => {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const query = `
      query($username: String!, $from: DateTime!) {
        user(login: $username) {
          contributionsCollection(from: $from) {
            totalCommitContributions
            totalPullRequestContributions
            totalIssueContributions
            commitContributionsByRepository {
              repository {
                name
              }
              contributions {
                totalCount
              }
            }
            pullRequestContributionsByRepository {
              repository {
                name
              }
              contributions {
                totalCount
              }
            }
            issueContributionsByRepository {
              repository {
                name
              }
              contributions {
                totalCount
              }
            }
            pullRequestReviewContributions(first: 100) {
              nodes {
                repository {
                  name
                }
                pullRequest {
                  author {
                    login
                  }
                  mergedAt
                  createdAt
                }
              }
            }
            contributionCalendar {
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
          repositories(first: 100) {
            nodes {
              name
              languages(first: 5) {
                edges {
                  node {
                    name
                  }
                  size
                }
              }
            }
          }
        }
      }
    `;

    const fromDate = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const { user } = await octokit.graphql(query, {
      username,
      from: fromDate,
    });

    // Process data to extract necessary statistics
    const stats: Stats = {
      totalCommits: user.contributionsCollection.totalCommitContributions,
      totalPRs: user.contributionsCollection.totalPullRequestContributions,
      totalIssues: user.contributionsCollection.totalIssueContributions,
      commitsByRepo: {},
      prsByRepo: {},
      issuesByRepo: {},
      commentsOnPRs: 0,
      topReviewers: {},
      mostReviewedRepos: {},
      topLanguages: {},
      monthlyContributions: {},
      prMergeTimes: [],
      issueResolutionTimes: [],
      mostActiveDay: '',
      topReposByCommits: {},
      topReposByIssues: {},
    };

    // Calculate monthly contributions
    user.contributionsCollection.contributionCalendar.weeks.forEach(week => {
      week.contributionDays.forEach(day => {
        const month = new Date(day.date).toLocaleString('default', { month: 'long' });
        stats.monthlyContributions[month] = (stats.monthlyContributions[month] || 0) + day.contributionCount;
      });
    });

    // Calculate commit statistics
    user.contributionsCollection.commitContributionsByRepository.forEach(repo => {
      stats.commitsByRepo[repo.repository.name] = repo.contributions.totalCount;
    });

    // Calculate PR statistics
    user.contributionsCollection.pullRequestContributionsByRepository.forEach(repo => {
      stats.prsByRepo[repo.repository.name] = repo.contributions.totalCount;
    });

    // Calculate issue statistics
    user.contributionsCollection.issueContributionsByRepository.forEach(repo => {
      stats.issuesByRepo[repo.repository.name] = repo.contributions.totalCount;
    });

    // Calculate PR review statistics
    user.contributionsCollection.pullRequestReviewContributions.nodes.forEach(contribution => {
      stats.commentsOnPRs += 1;
      const reviewer = contribution.pullRequest.author.login;
      stats.topReviewers[reviewer] = (stats.topReviewers[reviewer] || 0) + 1;
      const repoName = contribution.repository.name;
      stats.mostReviewedRepos[repoName] = (stats.mostReviewedRepos[repoName] || 0) + 1;

      // Calculate PR merge times
      if (contribution.pullRequest.mergedAt) {
        const mergeTime = new Date(contribution.pullRequest.mergedAt).getTime() - new Date(contribution.pullRequest.createdAt).getTime();
        stats.prMergeTimes.push(mergeTime);
      }
    });

    // Calculate language statistics
    user.repositories.nodes.forEach(repo => {
      repo.languages.edges.forEach(language => {
        stats.topLanguages[language.node.name] = (stats.topLanguages[language.node.name] || 0) + language.size;
      });
    });

    // Calculate most active day
    const dayCounts: Record<string, number> = {};
    user.contributionsCollection.contributionCalendar.weeks.forEach(week => {
      week.contributionDays.forEach(day => {
        const dayOfWeek = new Date(day.date).toLocaleString('default', { weekday: 'long' });
        dayCounts[dayOfWeek] = (dayCounts[dayOfWeek] || 0) + day.contributionCount;
      });
    });
    stats.mostActiveDay = Object.keys(dayCounts).reduce((a, b) => dayCounts[a] > dayCounts[b] ? a : b);

    // Calculate top repositories by commits and issues
    stats.topReposByCommits = Object.fromEntries(
      Object.entries(stats.commitsByRepo).sort(([, a], [, b]) => b - a).slice(0, 5)
    );
    stats.topReposByIssues = Object.fromEntries(
      Object.entries(stats.issuesByRepo).sort(([, a], [, b]) => b - a).slice(0, 5)
    );

    setStats(stats);
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      if (githubHandle.trim() === "") {
        setError("Please enter a GitHub handle.");
      } else {
        setError("");
        fetchStats(githubHandle);
        setShowStats(true);
      }
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-cover bg-center christmas-theme">
      <div className="relative w-full">
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out transform ${showStats ? 'opacity-0 -translate-y-full' : 'opacity-100 translate-y-0'}`}>
          <div className="flex flex-col items-center gap-16 bg-gray-900 text-white p-8 rounded-lg shadow-lg">
            <header className="flex flex-col items-center gap-9">
              <h1 className="text-4xl font-extrabold tracking-wider">GitHub Unwrapped</h1>
              <div className="h-36 w-96 flex items-center justify-center bg-white rounded-lg shadow-md">
                <img
                  src="/images/company.png"
                  alt="Company Logo"
                  className="block w-3/4"
                />
              </div>
            </header>
            <div className="input-bar">
              <input
                type="text"
                placeholder="GitHub Username"
                className="p-3 text-lg border-2 border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white text-gray-900"
                value={githubHandle}
                onChange={(e) => setGithubHandle(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              {error && <p className="text-red-500 mt-2">{error}</p>}
            </div>
          </div>
        </div>
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out transform ${showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full'}`}>
          {stats && (
            <div className="flex flex-wrap items-start justify-center gap-4 p-4 w-full">
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Commits</h2>
                <p>{stats.totalCommits}</p>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Pull Requests</h2>
                <p>{stats.totalPRs}</p>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Issues</h2>
                <p>{stats.totalIssues}</p>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Comments on PRs</h2>
                <p>{stats.commentsOnPRs}</p>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Top Reviewers</h2>
                <ul>
                  {Object.entries(stats.topReviewers).map(([reviewer, count]) => (
                    <li key={reviewer}>{reviewer}: {count}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Most Reviewed Repos</h2>
                <ul>
                  {Object.entries(stats.mostReviewedRepos).map(([repo, count]) => (
                    <li key={repo}>{repo}: {count}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Top Languages</h2>
                <ul>
                  {Object.entries(stats.topLanguages).map(([language, count]) => (
                    <li key={language}>{language}: {count}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Most Active Day</h2>
                <p>{stats.mostActiveDay}</p>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Top Repos by Commits</h2>
                <ul>
                  {Object.entries(stats.topReposByCommits).map(([repo, count]) => (
                    <li key={repo}>{repo}: {count}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-white text-gray-900 p-4 rounded-lg shadow-md w-64 flex-shrink-0">
                <h2 className="text-xl font-bold">Top Repos by Issues</h2>
                <ul>
                  {Object.entries(stats.topReposByIssues).map(([repo, count]) => (
                    <li key={repo}>{repo}: {count}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="bg-gray-900 text-white p-4 fixed bottom-0 w-full flex justify-center items-center">
        <p className="text-sm">Powered by Devleaps</p>
      </footer>
    </div>
  );
}
